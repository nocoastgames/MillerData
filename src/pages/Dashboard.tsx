import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Student } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Target, LineChart, History, Users, FileText } from 'lucide-react';
import { useNavigate } from 'react-router';

export const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.role === 'admin') {
      q = query(collection(db, 'students'), where('status', '==', 'active'));
    } else {
      q = query(
        collection(db, 'students'), 
        where('roomNumber', '==', profile.roomNumber),
        where('status', '==', 'active')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const studentData: Student[] = [];
      snapshot.forEach((doc) => {
        studentData.push({ id: doc.id, ...doc.data() } as Student);
      });
      // Sort by room number then last name
      studentData.sort((a, b) => {
        if (a.roomNumber !== b.roomNumber) return a.roomNumber.localeCompare(b.roomNumber);
        return a.lastName.localeCompare(b.lastName);
      });
      setStudents(studentData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  // Group students by room
  const groupedStudents = students.reduce((acc, student) => {
    if (!acc[student.roomNumber]) acc[student.roomNumber] = [];
    acc[student.roomNumber].push(student);
    return acc;
  }, {} as Record<string, Student[]>);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Student Roster</h1>
          <p className="text-muted-foreground mt-1">
            {profile?.role === 'admin' ? 'All active students across all rooms' : `Room ${profile?.roomNumber} active students`}
          </p>
        </div>
      </div>

      {Object.keys(groupedStudents).length === 0 ? (
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No students found</h3>
            <p className="text-muted-foreground max-w-md">
              {profile?.role === 'admin' 
                ? "There are no active students in the system. Go to the Admin Panel to add students."
                : `There are no active students assigned to Room ${profile?.roomNumber}. Contact an administrator if this is incorrect.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedStudents).map(([room, roomStudents]: [string, Student[]]) => (
          <div key={room} className="space-y-4">
            {profile?.role === 'admin' && (
              <h2 className="text-xl font-semibold flex items-center gap-2 text-primary">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm">
                  {room}
                </div>
                Room {room}
              </h2>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roomStudents.map(student => (
                <Card key={student.id} className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="bg-white pb-4 border-b">
                    <CardTitle className="text-xl">
                      {student.firstName} {student.lastName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">ID: {student.studentId}</p>
                  </CardHeader>
                  <CardContent className="p-4 bg-muted/10">
                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        variant="default" 
                        className="h-14 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-sm"
                        onClick={() => navigate(`/student/${student.id}/data`)}
                      >
                        <Activity className="w-5 h-5" />
                        <span className="text-xs">Data</span>
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="h-14 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-sm"
                        onClick={() => navigate(`/student/${student.id}/mass`)}
                      >
                        <FileText className="w-5 h-5" />
                        <span className="text-xs">Mass</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-14 rounded-2xl flex flex-col items-center justify-center gap-1 bg-white"
                        onClick={() => navigate(`/student/${student.id}/goals`)}
                      >
                        <Target className="w-5 h-5 text-primary" />
                        <span className="text-xs">Goals</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-14 rounded-2xl flex flex-col items-center justify-center gap-1 bg-white"
                        onClick={() => navigate(`/student/${student.id}/graph`)}
                      >
                        <LineChart className="w-5 h-5 text-primary" />
                        <span className="text-xs">Graph</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-14 rounded-2xl flex flex-col items-center justify-center gap-1 bg-white col-span-2"
                        onClick={() => navigate(`/student/${student.id}/history`)}
                      >
                        <History className="w-5 h-5 text-primary" />
                        <span className="text-xs">History</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
