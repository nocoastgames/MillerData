import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Student, Role, Goal, DataPoint } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Save, X, Trash2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export const AdminPanel = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<Partial<UserProfile>>({});
  
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<Partial<Student>>({});
  
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    firstName: '', lastName: '', studentId: '', roomNumber: '', status: 'active'
  });

  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [allDataPoints, setAllDataPoints] = useState<DataPoint[]>([]);
  const [complianceTarget, setComplianceTarget] = useState(2);
  const [complianceMonth, setComplianceMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const usersData: UserProfile[] = [];
      snapshot.forEach((doc) => usersData.push({ id: doc.id, ...doc.data() } as UserProfile));
      setUsers(usersData);
    });

    const qStudents = query(collection(db, 'students'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const studentsData: Student[] = [];
      snapshot.forEach((doc) => studentsData.push({ id: doc.id, ...doc.data() } as Student));
      setStudents(studentsData);
    });

    const qGoals = query(collection(db, 'goals'), where('status', '==', 'active'));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      const goalsData: Goal[] = [];
      snapshot.forEach((doc) => goalsData.push({ id: doc.id, ...doc.data() } as Goal));
      setAllGoals(goalsData);
    });

    return () => {
      unsubUsers();
      unsubStudents();
      unsubGoals();
    };
  }, []);

  useEffect(() => {
    if (!complianceMonth) return;
    const [year, month] = complianceMonth.split('-');
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString();
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59).toISOString();

    const qData = query(
      collection(db, 'dataPoints'),
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate)
    );
    const unsubData = onSnapshot(qData, (snapshot) => {
      const dp: DataPoint[] = [];
      snapshot.forEach((doc) => dp.push({ id: doc.id, ...doc.data() } as DataPoint));
      setAllDataPoints(dp);
    });
    return () => unsubData();
  }, [complianceMonth]);

  const handleSaveUser = async (id: string) => {
    try {
      const { id: _, ...dataToUpdate } = editUser as any;
      await updateDoc(doc(db, 'users', id), dataToUpdate);
      toast.success('User updated');
      setEditingUserId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${id}`);
      toast.error('Failed to update user');
    }
  };

  const handleSaveStudent = async (id: string) => {
    try {
      const { id: _, ...dataToUpdate } = editStudent as any;
      await updateDoc(doc(db, 'students', id), dataToUpdate);
      toast.success('Student updated');
      setEditingStudentId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${id}`);
      toast.error('Failed to update student');
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.firstName || !newStudent.lastName || !newStudent.studentId || !newStudent.roomNumber) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await addDoc(collection(db, 'students'), newStudent);
      toast.success('Student added');
      setIsAddingStudent(false);
      setNewStudent({ firstName: '', lastName: '', studentId: '', roomNumber: '', status: 'active' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'students');
      toast.error('Failed to add student');
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this student? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'students', id));
      toast.success('Student deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
      toast.error('Failed to delete student');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-muted-foreground">Manage users, roles, and student assignments</p>
      </div>

      <Tabs defaultValue="students" className="w-full">
        <TabsList className="rounded-full h-12 p-1 mb-6">
          <TabsTrigger value="students" className="rounded-full px-8">Students</TabsTrigger>
          <TabsTrigger value="users" className="rounded-full px-8">Staff & Users</TabsTrigger>
          <TabsTrigger value="compliance" className="rounded-full px-8">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Student Directory</h2>
            <Button onClick={() => setIsAddingStudent(true)} className="rounded-full">
              <Plus className="w-4 h-4 mr-2" /> Add Student
            </Button>
          </div>

          {isAddingStudent && (
            <Card className="border-2 border-primary shadow-sm">
              <CardHeader className="bg-primary/5 pb-4">
                <CardTitle className="text-lg">Add New Student</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={newStudent.firstName} onChange={e => setNewStudent({...newStudent, firstName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input value={newStudent.lastName} onChange={e => setNewStudent({...newStudent, lastName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Student ID</Label>
                    <Input value={newStudent.studentId} onChange={e => setNewStudent({...newStudent, studentId: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Room Number</Label>
                    <Input value={newStudent.roomNumber} onChange={e => setNewStudent({...newStudent, roomNumber: e.target.value})} />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsAddingStudent(false)}>Cancel</Button>
                  <Button onClick={handleAddStudent}>Save Student</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Student ID</th>
                      <th className="px-6 py-4">Room</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const isEditing = editingStudentId === student.id;
                      return (
                        <tr key={student.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <Input value={editStudent.firstName} onChange={e => setEditStudent({...editStudent, firstName: e.target.value})} className="w-24" />
                                <Input value={editStudent.lastName} onChange={e => setEditStudent({...editStudent, lastName: e.target.value})} className="w-24" />
                              </div>
                            ) : (
                              <span className="font-medium">{student.firstName} {student.lastName}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <Input value={editStudent.studentId} onChange={e => setEditStudent({...editStudent, studentId: e.target.value})} className="w-24" />
                            ) : (
                              <span className="font-mono text-muted-foreground">{student.studentId}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <Input value={editStudent.roomNumber} onChange={e => setEditStudent({...editStudent, roomNumber: e.target.value})} className="w-20" />
                            ) : (
                              <span className="bg-primary/10 text-primary px-2 py-1 rounded-md font-medium">{student.roomNumber}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <select 
                                className="h-10 rounded-md border border-input px-3 py-2 text-sm"
                                value={editStudent.status}
                                onChange={e => setEditStudent({...editStudent, status: e.target.value as 'active' | 'archived'})}
                              >
                                <option value="active">Active</option>
                                <option value="archived">Archived</option>
                              </select>
                            ) : (
                              <span className={`capitalize px-2 py-1 rounded-md text-xs font-medium ${student.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                {student.status}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isEditing ? (
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => setEditingStudentId(null)}><X className="w-4 h-4" /></Button>
                                <Button variant="default" size="icon" onClick={() => handleSaveStudent(student.id)}><Save className="w-4 h-4" /></Button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => { setEditingStudentId(student.id); setEditStudent(student); }}>
                                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteStudent(student.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Staff Directory</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              <ShieldAlert className="w-4 h-4" />
              Users are automatically added upon first login
            </div>
          </div>

          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Room</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isEditing = editingUserId === user.id;
                      return (
                        <tr key={user.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <Input value={editUser.name} onChange={e => setEditUser({...editUser, name: e.target.value})} className="w-32" />
                            ) : (
                              <span className="font-medium">{user.name}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <select 
                                className="h-10 rounded-md border border-input px-3 py-2 text-sm"
                                value={editUser.role}
                                onChange={e => setEditUser({...editUser, role: e.target.value as Role})}
                              >
                                <option value="admin">Admin</option>
                                <option value="teacher">Teacher</option>
                                <option value="para">Para</option>
                                <option value="editor">Editor</option>
                              </select>
                            ) : (
                              <span className={`capitalize px-2 py-1 rounded-md text-xs font-medium ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                user.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {user.role}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <Input value={editUser.roomNumber} onChange={e => setEditUser({...editUser, roomNumber: e.target.value})} className="w-20" />
                            ) : (
                              <span className="font-medium">{user.roomNumber}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <select 
                                className="h-10 rounded-md border border-input px-3 py-2 text-sm"
                                value={editUser.status}
                                onChange={e => setEditUser({...editUser, status: e.target.value as 'active' | 'inactive'})}
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            ) : (
                              <span className={`capitalize px-2 py-1 rounded-md text-xs font-medium ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {user.status}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isEditing ? (
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => setEditingUserId(null)}><X className="w-4 h-4" /></Button>
                                <Button variant="default" size="icon" onClick={() => handleSaveUser(user.id)}><Save className="w-4 h-4" /></Button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => { setEditingUserId(user.id); setEditUser(user); }}>
                                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Data Collection Compliance</h2>
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">Target / Month:</Label>
                <Input type="number" value={complianceTarget} onChange={e => setComplianceTarget(parseInt(e.target.value) || 0)} className="w-20" />
              </div>
              <div className="flex items-center gap-2">
                <Label>Month:</Label>
                <Input type="month" value={complianceMonth} onChange={e => setComplianceMonth(e.target.value)} />
              </div>
            </div>
          </div>

          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                    <tr>
                      <th className="px-6 py-4">Room</th>
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Goal</th>
                      <th className="px-6 py-4">Data Points</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      students.reduce((acc, student) => {
                        if (!acc[student.roomNumber]) acc[student.roomNumber] = [];
                        acc[student.roomNumber].push(student);
                        return acc;
                      }, {} as Record<string, Student[]>)
                    ).sort(([roomA], [roomB]) => roomA.localeCompare(roomB)).map(([room, roomStudents]) => (
                      <React.Fragment key={room}>
                        {roomStudents.map(student => {
                          const studentGoals = allGoals.filter(g => g.studentId === student.id);
                          if (studentGoals.length === 0) {
                            return (
                              <tr key={student.id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-6 py-4 font-medium">{room}</td>
                                <td className="px-6 py-4">{student.firstName} {student.lastName}</td>
                                <td className="px-6 py-4 text-muted-foreground italic" colSpan={3}>No active goals</td>
                              </tr>
                            );
                          }
                          return studentGoals.map((goal, index) => {
                            const goalDataPoints = allDataPoints.filter(dp => dp.goalId === goal.id);
                            const count = goalDataPoints.length;
                            const isCompliant = count >= complianceTarget;
                            return (
                              <tr key={goal.id} className="border-b last:border-0 hover:bg-muted/20">
                                {index === 0 && (
                                  <>
                                    <td className="px-6 py-4 font-medium" rowSpan={studentGoals.length}>{room}</td>
                                    <td className="px-6 py-4" rowSpan={studentGoals.length}>{student.firstName} {student.lastName}</td>
                                  </>
                                )}
                                <td className="px-6 py-4 truncate max-w-[200px]" title={goal.title}>{goal.title}</td>
                                <td className="px-6 py-4 font-mono">{count}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${isCompliant ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {isCompliant ? 'Compliant' : 'Needs Data'}
                                  </span>
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
