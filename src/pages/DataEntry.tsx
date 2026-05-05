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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Check, X, Plus, Play, Square, ArrowLeft, Calendar as CalendarIcon, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const PercentageTracker = ({ onSave }: { onSave: (percentage: number) => void }) => {
  const [trials, setTrials] = useState<boolean[]>([]);
  const [manualValue, setManualValue] = useState<string>('');

  const handleSuccess = () => {
    setTrials([...trials, true]);
    setManualValue(''); // Clear manual value when a trial is added
  };

  const handleFail = () => {
    setTrials([...trials, false]);
    setManualValue(''); // Clear manual value when a trial is added
  };

  const calculatePercentage = () => {
    if (trials.length === 0) return 0;
    const successes = trials.filter(t => t).length;
    return Math.round((successes / trials.length) * 100);
  };

  const currentPercentage = trials.length > 0 ? calculatePercentage() : null;

  const handleSave = () => {
    if (manualValue !== '') {
      onSave(Number(manualValue));
    } else if (trials.length > 0) {
      onSave(calculatePercentage());
    }
    setTrials([]);
    setManualValue('');
  };

  return (
    <div className="flex flex-col gap-3 w-full lg:w-72 bg-white/50 p-3 border rounded-none shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">Record Trials</span>
        {currentPercentage !== null && manualValue === '' && (
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-none">
            {currentPercentage}%
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline"
          onClick={handleSuccess}
          className="flex-1 rounded-none h-9 bg-white hover:bg-green-50 text-green-700 border-green-200 shadow-sm"
        >
          <Check className="w-4 h-4 mr-1.5" /> (+1)
        </Button>
        <Button 
          variant="outline"
          onClick={handleFail}
          className="flex-1 rounded-none h-9 bg-white hover:bg-red-50 text-red-700 border-red-200 shadow-sm"
        >
          <X className="w-4 h-4 mr-1.5" /> (-1)
        </Button>
      </div>

      <div className="min-h-[28px] border bg-slate-50 flex items-center p-1 gap-1 flex-wrap content-start">
        {trials.length === 0 && (
          <span className="text-xs text-muted-foreground w-full text-center py-1">No trials recorded</span>
        )}
        {trials.map((t, idx) => (
          <span key={idx} className={`w-5 h-5 flex items-center justify-center text-xs font-bold border ${t ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
            {t ? '+' : '-'}
          </span>
        ))}
      </div>

      <div className="text-center text-xs text-muted-foreground font-medium my-1">OR</div>

      <div className="flex items-center gap-2">
        <Input 
          type="number"
          min="0"
          max="100"
          placeholder="Manual %"
          value={manualValue}
          onChange={(e) => {
            setManualValue(e.target.value);
            setTrials([]); // Clear trials when manual percentage is added
          }}
          className="rounded-none h-9 text-sm"
        />
        <Button 
          onClick={handleSave}
          disabled={trials.length === 0 && manualValue === ''}
          className="rounded-none h-9 w-24 shrink-0"
        >
          Save
        </Button>
      </div>
    </div>
  );
};

const DurationTracker = ({ onSave }: { onSave: (seconds: number) => void }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="flex items-center gap-2 bg-muted/60 p-2 rounded-none border">
      <div className="font-mono text-lg font-bold w-16 text-center">{formatTime(seconds)}</div>
      <Button 
        size="sm" 
        variant={isRunning ? 'secondary' : 'default'} 
        className="rounded-none px-4"
        onClick={() => setIsRunning(!isRunning)}
      >
        {isRunning ? <Square className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
        {isRunning ? 'Stop' : 'Start'}
      </Button>
      <Button 
        size="sm" 
        variant="outline" 
        className="rounded-none px-4"
        disabled={seconds === 0} 
        onClick={() => {
          onSave(seconds);
          setSeconds(0);
          setIsRunning(false);
        }}
      >
        Save
      </Button>
    </div>
  );
};

export const DataEntry = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  
  const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));

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

  const handleSaveData = async (goalId: string, objId: string, value: number) => {
    if (!profile || !studentId) return;

    try {
      await addDoc(collection(db, 'dataPoints'), {
        studentId,
        goalId,
        objId,
        value,
        timestamp: new Date(entryDate + 'T12:00:00').toISOString(),
        recordedBy: profile.name,
        recordedByRole: profile.role,
        actualEntryTimestamp: new Date().toISOString()
      });
      toast.success('Data recorded');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'dataPoints');
      toast.error('Failed to save data');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" className="rounded-none shadow-sm" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data Entry</h1>
            <p className="text-sm font-medium text-slate-500">{student?.firstName} {student?.lastName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Input 
              type="date" 
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="pl-10 h-10 w-full sm:w-44 rounded-none border-slate-200 shadow-sm text-sm font-medium"
            />
            <CalendarIcon className="absolute left-3.5 top-2.5 text-slate-400 w-5 h-5" />
          </div>
          <Button variant="outline" className="rounded-none shadow-sm border-slate-200 px-4 h-10 hidden sm:flex shrink-0" onClick={() => navigate(`/student/${studentId}/print`)}>
            <Printer className="w-4 h-4 mr-2 text-slate-500" />
            <span className="text-sm font-medium">Print Sheet</span>
          </Button>
        </div>
      </div>

      {goals.length === 0 ? (
        <Card className="border-slate-200 shadow-sm bg-slate-50/50">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No Active Goals</h3>
            <p className="text-slate-500 max-w-sm mx-auto mb-6">This student doesn't have any active goals. Add some goals in Goal Management to start tracking data.</p>
            <Button onClick={() => navigate(`/student/${studentId}/goals`)} className="rounded-none">
              Manage Goals
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="w-full space-y-4">
          {goals.map(goal => (
            <AccordionItem key={goal.id} value={goal.id} className="border border-slate-200 rounded-none shadow-[0_2px_8px_rgba(0,0,0,0.04)] bg-white overflow-hidden px-1">
              <AccordionTrigger className="hover:no-underline py-4 px-4">
                <div className="text-left flex-1 pr-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-none">
                        {goal.domain}
                      </span>
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-none ${
                        goal.trackingType === 'percentage' ? 'bg-indigo-50 text-indigo-700' :
                        goal.trackingType === 'frequency' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {goal.trackingType}
                      </span>
                    </div>
                    <div className="text-base font-semibold text-slate-900 leading-snug">{goal.title}</div>
                  </div>
                  <div className="text-sm font-medium text-slate-500 whitespace-nowrap hidden sm:block">
                    {goal.objectives?.length || 0} objectives
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-0 pb-4 px-4">
                <div className="flex flex-col gap-3 mt-2">
                  {(goal.objectives || []).map(obj => (
                    <div key={obj.id} className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 rounded-none border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-800">{obj.title}</span>
                      </div>
                      
                      <div className="shrink-0 w-full lg:w-auto">
                        {goal.trackingType === 'percentage' && (
                          <PercentageTracker onSave={(val) => handleSaveData(goal.id, obj.id, val)} />
                        )}

                        {goal.trackingType === 'frequency' && (
                          <Button 
                            onClick={() => handleSaveData(goal.id, obj.id, 1)}
                            className="w-full lg:w-auto rounded-none h-10 px-6 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm"
                          >
                            <Plus className="w-4 h-4 mr-1.5" /> Log Occurence (+1)
                          </Button>
                        )}

                        {goal.trackingType === 'duration' && (
                          <DurationTracker onSave={(val) => handleSaveData(goal.id, obj.id, val)} />
                        )}
                      </div>
                    </div>
                  ))}
                  {(!goal.objectives || goal.objectives.length === 0) && (
                    <div className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded-none border border-dashed border-slate-200">
                      No objectives found for this goal.
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};
