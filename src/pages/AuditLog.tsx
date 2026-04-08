import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { collection, query, where, onSnapshot, doc, getDoc, deleteDoc, updateDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Goal, Student, DataPoint } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Trash2, Edit2, Save, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

export const AuditLog = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    if (!studentId) return;

    const fetchStudent = async () => {
      try {
        const docRef = doc(db, 'students', studentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setStudent({ id: docSnap.id, ...docSnap.data() } as Student);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `students/${studentId}`);
      }
    };
    fetchStudent();

    const qGoals = query(collection(db, 'goals'), where('studentId', '==', studentId));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      const goalsData: Goal[] = [];
      snapshot.forEach((doc) => goalsData.push({ id: doc.id, ...doc.data() } as Goal));
      setGoals(goalsData);
    });

    const qData = query(collection(db, 'dataPoints'), where('studentId', '==', studentId));
    const unsubData = onSnapshot(qData, (snapshot) => {
      const points: DataPoint[] = [];
      snapshot.forEach((doc) => points.push({ id: doc.id, ...doc.data() } as DataPoint));
      // Sort descending by timestamp
      points.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setDataPoints(points);
    });

    return () => {
      unsubGoals();
      unsubData();
    };
  }, [studentId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this data point?')) return;
    try {
      await deleteDoc(doc(db, 'dataPoints', id));
      toast.success('Data point deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `dataPoints/${id}`);
      toast.error('Failed to delete data point');
    }
  };

  const handleSaveEdit = async (id: string) => {
    const numVal = parseFloat(editValue);
    if (isNaN(numVal)) {
      toast.error('Invalid number');
      return;
    }
    try {
      await updateDoc(doc(db, 'dataPoints', id), { value: numVal });
      toast.success('Data point updated');
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `dataPoints/${id}`);
      toast.error('Failed to update data point');
    }
  };

  const getGoalInfo = (goalId: string, objId: string) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return { goalTitle: 'Unknown Goal', objTitle: 'Unknown Objective' };
    const obj = goal.objectives.find(o => o.id === objId);
    return { goalTitle: goal.title, objTitle: obj?.title || 'Unknown Objective' };
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Audit Log (History)</h1>
          <p className="text-muted-foreground">{student?.firstName} {student?.lastName}</p>
        </div>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                <tr>
                  <th className="px-6 py-4 rounded-tl-2xl">Date</th>
                  <th className="px-6 py-4">Goal / Sub-Skill</th>
                  <th className="px-6 py-4">Value</th>
                  <th className="px-6 py-4">Recorded By</th>
                  <th className="px-6 py-4 rounded-tr-2xl text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dataPoints.map((dp) => {
                  const { goalTitle, objTitle } = getGoalInfo(dp.goalId, dp.objId);
                  const isEditing = editingId === dp.id;
                  
                  return (
                    <tr key={dp.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {format(parseISO(dp.timestamp), 'MMM dd, yyyy')}
                        <div className="text-xs text-muted-foreground mt-1">
                          Entered: {format(parseISO(dp.actualEntryTimestamp), 'MMM dd, HH:mm')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{goalTitle}</div>
                        <div className="text-muted-foreground mt-1">{objTitle}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-lg">
                        {isEditing ? (
                          <Input 
                            type="number" 
                            value={editValue} 
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 h-10"
                            autoFocus
                          />
                        ) : (
                          dp.value
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {dp.recordedBy}
                        <div className="text-xs text-muted-foreground capitalize mt-1">{dp.recordedByRole}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                            <Button variant="default" size="icon" onClick={() => handleSaveEdit(dp.id)}>
                              <Save className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => { setEditingId(dp.id); setEditValue(dp.value.toString()); }}>
                              <Edit2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(dp.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {dataPoints.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No data points recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
