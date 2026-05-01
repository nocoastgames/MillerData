import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { collection, query, where, onSnapshot, addDoc, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Goal, Student, Objective } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Plus, Play, Square, ArrowLeft, Calendar as CalendarIcon, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export const DataEntry = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [selectedObj, setSelectedObj] = useState<Objective | null>(null);
  
  const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Duration state
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  const handleSaveData = async (value: number) => {
    if (!profile || !studentId || !selectedGoal || !selectedObj) return;

    try {
      await addDoc(collection(db, 'dataPoints'), {
        studentId,
        goalId: selectedGoal.id,
        objId: selectedObj.id,
        value,
        timestamp: new Date(entryDate + 'T12:00:00').toISOString(),
        recordedBy: profile.name,
        recordedByRole: profile.role,
        actualEntryTimestamp: new Date().toISOString()
      });
      toast.success('Data saved successfully');
      
      // Reset timer if it was duration
      if (selectedGoal.trackingType === 'duration') {
        setIsTimerRunning(false);
        setElapsedSeconds(0);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'dataPoints');
      toast.error('Failed to save data');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">Data Entry</h1>
          <p className="text-muted-foreground">{student?.firstName} {student?.lastName}</p>
        </div>
        <Button variant="outline" className="rounded-full shadow-sm hidden md:flex" onClick={() => navigate(`/student/${studentId}/print`)}>
          <Printer className="w-4 h-4 mr-2" />
          Print Data Sheet
        </Button>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-base">Date of Data</Label>
            <div className="relative">
              <Input 
                type="date" 
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="h-14 text-lg rounded-2xl pl-12"
              />
              <CalendarIcon className="absolute left-4 top-4 text-muted-foreground w-6 h-6" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">Select Goal</Label>
            <div className="grid grid-cols-1 gap-3">
              {goals.map(goal => (
                <button
                  key={goal.id}
                  onClick={() => {
                    setSelectedGoal(goal);
                    setSelectedObj(null);
                  }}
                  className={`p-4 rounded-2xl text-left transition-all border-2 ${
                    selectedGoal?.id === goal.id 
                      ? 'border-primary bg-primary/5 shadow-sm' 
                      : 'border-transparent bg-muted hover:bg-muted/80'
                  }`}
                >
                  <div className="font-semibold">[{goal.domain}] {goal.title}</div>
                  <div className="text-sm text-muted-foreground capitalize">{goal.trackingType} Tracking</div>
                </button>
              ))}
              {goals.length === 0 && (
                <div className="p-4 text-center text-muted-foreground bg-muted rounded-2xl">
                  No active goals found for this student.
                </div>
              )}
            </div>
          </div>

          {selectedGoal && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-4">
              <Label className="text-base">Select Sub-Skill (Objective)</Label>
              <div className="grid grid-cols-1 gap-3">
                {(selectedGoal.objectives || []).map(obj => (
                  <button
                    key={obj.id}
                    onClick={() => setSelectedObj(obj)}
                    className={`p-4 rounded-2xl text-left transition-all border-2 ${
                      selectedObj?.id === obj.id 
                        ? 'border-secondary bg-secondary/10 shadow-sm' 
                        : 'border-transparent bg-muted hover:bg-muted/80'
                    }`}
                  >
                    <div className="font-medium">{obj.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedGoal && selectedObj && (
            <div className="pt-6 border-t animate-in fade-in slide-in-from-top-4">
              <Label className="text-base mb-4 block">Record Data</Label>
              
              {selectedGoal.trackingType === 'percentage' && (
                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    onClick={() => handleSaveData(100)}
                    className="h-32 rounded-[2rem] bg-green-500 hover:bg-green-600 text-white flex flex-col gap-2 text-xl"
                  >
                    <Check className="w-10 h-10" />
                    Success
                  </Button>
                  <Button 
                    onClick={() => handleSaveData(0)}
                    className="h-32 rounded-[2rem] bg-destructive hover:bg-destructive/90 text-white flex flex-col gap-2 text-xl"
                  >
                    <X className="w-10 h-10" />
                    Fail
                  </Button>
                </div>
              )}

              {selectedGoal.trackingType === 'frequency' && (
                <Button 
                  onClick={() => handleSaveData(1)}
                  className="w-full h-32 rounded-[2rem] bg-primary hover:bg-primary/90 text-white flex flex-col gap-2 text-xl"
                >
                  <Plus className="w-10 h-10" />
                  Add Tally (+1)
                </Button>
              )}

              {selectedGoal.trackingType === 'duration' && (
                <div className="space-y-4">
                  <div className="text-center text-5xl font-mono font-bold py-8 bg-muted rounded-[2rem]">
                    {formatTime(elapsedSeconds)}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      onClick={() => setIsTimerRunning(!isTimerRunning)}
                      className={`h-20 rounded-2xl text-xl ${isTimerRunning ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90' : 'bg-primary hover:bg-primary/90'}`}
                    >
                      {isTimerRunning ? <Square className="w-8 h-8 mr-2" /> : <Play className="w-8 h-8 mr-2" />}
                      {isTimerRunning ? 'Stop' : 'Start'}
                    </Button>
                    <Button 
                      onClick={() => handleSaveData(elapsedSeconds)}
                      disabled={elapsedSeconds === 0}
                      className="h-20 rounded-2xl text-xl bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                    >
                      Save Time
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
