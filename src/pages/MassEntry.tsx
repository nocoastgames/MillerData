import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { collection, query, where, onSnapshot, addDoc, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Goal, Student } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Calendar as CalendarIcon, Save } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export const MassEntry = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // State for mass entry values: objId -> value string
  const [values, setValues] = useState<Record<string, string>>({});

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

    const q = query(
      collection(db, 'goals'),
      where('studentId', '==', studentId),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const goalsData: Goal[] = [];
      snapshot.forEach((doc) => {
        goalsData.push({ id: doc.id, ...doc.data() } as Goal);
      });
      setGoals(goalsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goals');
    });

    return () => unsubscribe();
  }, [studentId]);

  const handleSaveMassData = async () => {
    if (!profile || !studentId || !selectedGoal) return;

    const entriesToSave = Object.entries(values).filter(([_, val]: [string, string]) => val.trim() !== '');
    
    if (entriesToSave.length === 0) {
      toast.error('No data entered');
      return;
    }

    try {
      const timestamp = new Date(entryDate + 'T12:00:00').toISOString();
      const actualEntryTimestamp = new Date().toISOString();

      const promises = entriesToSave.map(([objId, val]: [string, string]) => {
        let numValue = parseFloat(val);
        if (isNaN(numValue)) return Promise.resolve(); // Skip invalid

        return addDoc(collection(db, 'dataPoints'), {
          studentId,
          goalId: selectedGoal.id,
          objId,
          value: numValue,
          timestamp,
          recordedBy: profile.name,
          recordedByRole: profile.role,
          actualEntryTimestamp
        });
      });

      await Promise.all(promises);
      toast.success(`Saved ${entriesToSave.length} data points`);
      setValues({}); // Clear after save
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'dataPoints');
      toast.error('Failed to save some data points');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mass Entry</h1>
          <p className="text-muted-foreground">{student?.firstName} {student?.lastName}</p>
        </div>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base">Date of Data</Label>
              <div className="relative">
                <Input 
                  type="date" 
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="h-12 rounded-xl pl-12"
                />
                <CalendarIcon className="absolute left-4 top-3 text-muted-foreground w-5 h-5" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-base">Select Goal</Label>
              <select 
                className="flex h-12 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedGoal?.id || ''}
                onChange={(e) => {
                  const goal = goals.find(g => g.id === e.target.value);
                  setSelectedGoal(goal || null);
                  setValues({});
                }}
              >
                <option value="" disabled>Select a goal...</option>
                {goals.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedGoal && (
            <div className="pt-6 border-t animate-in fade-in">
              <div className="flex justify-between items-center mb-4">
                <Label className="text-lg font-semibold">Enter Data for Sub-Skills</Label>
                <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {selectedGoal.trackingType === 'percentage' ? '0-100 (%)' : 
                   selectedGoal.trackingType === 'frequency' ? 'Count' : 'Seconds'}
                </span>
              </div>
              
              <div className="space-y-3">
                {selectedGoal.objectives.map((obj, index) => (
                  <div key={obj.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 font-medium text-sm md:text-base">
                      {obj.title}
                    </div>
                    <div className="w-24 shrink-0">
                      <Input 
                        type="number" 
                        placeholder="Value"
                        className="text-center font-mono text-lg h-12 rounded-xl"
                        value={values[obj.id] || ''}
                        onChange={(e) => setValues({...values, [obj.id]: e.target.value})}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex justify-end">
                <Button 
                  onClick={handleSaveMassData}
                  className="h-14 px-8 rounded-full text-lg shadow-md"
                >
                  <Save className="w-5 h-5 mr-2" />
                  Save All Entries
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
