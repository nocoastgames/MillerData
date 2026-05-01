import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { collection, query, where, onSnapshot, doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Goal, Student, DataPoint } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, LineChart as ChartIcon, Trash2, Edit2, Save, X } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { format, parseISO, compareAsc } from 'date-fns';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

const COLORS = ['#3b82f6', '#facc15', '#10b981', '#8b5cf6', '#f97316', '#ec4899', '#06b6d4'];

export const ProgressGraph = ({ isHistory = false }: { isHistory?: boolean }) => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void} | null>(null);
  
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);

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

    const qGoals = query(
      collection(db, 'goals'),
      where('studentId', '==', studentId),
      where('status', '==', isHistory ? 'archived' : 'active')
    );

    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      const goalsData: Goal[] = [];
      snapshot.forEach((doc) => {
        goalsData.push({ id: doc.id, ...doc.data() } as Goal);
      });
      setGoals(goalsData);
      if (goalsData.length > 0 && !selectedGoal) {
        setSelectedGoal(goalsData[0]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goals');
    });

    return () => unsubGoals();
  }, [studentId]);

  useEffect(() => {
    if (!studentId || !selectedGoal) return;

    const qData = query(
      collection(db, 'dataPoints'),
      where('studentId', '==', studentId),
      where('goalId', '==', selectedGoal.id)
    );

    const unsubData = onSnapshot(qData, (snapshot) => {
      const points: DataPoint[] = [];
      snapshot.forEach((doc) => {
        points.push({ id: doc.id, ...doc.data() } as DataPoint);
      });
      setDataPoints(points);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'dataPoints');
    });

    return () => unsubData();
  }, [studentId, selectedGoal]);

  const { chartData, interpretation } = useMemo(() => {
    if (!selectedGoal || dataPoints.length === 0) return { chartData: [], interpretation: null };

    // Group by date
    const groupedByDate: Record<string, Record<string, number[]>> = {};
    
    dataPoints.forEach(dp => {
      const dateStr = format(parseISO(dp.timestamp), 'MMM dd, yyyy');
      if (!groupedByDate[dateStr]) groupedByDate[dateStr] = {};
      if (!groupedByDate[dateStr][dp.objId]) groupedByDate[dateStr][dp.objId] = [];
      groupedByDate[dateStr][dp.objId].push(dp.value);
    });

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => 
      compareAsc(new Date(a), new Date(b))
    );

    const chartData = sortedDates.map(date => {
      const dataObj: any = { name: date };
      let totalSum = 0;
      let totalCount = 0;

      (selectedGoal.objectives || []).forEach(obj => {
        const values = groupedByDate[date][obj.id];
        if (values && values.length > 0) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          dataObj[obj.id] = avg;
          totalSum += avg;
          totalCount++;
        }
      });

      if (totalCount > 0) {
        dataObj.overall = totalSum / totalCount;
      }

      return dataObj;
    });

    // Interpretation Logic: Average of last 5 data points
    const last5Dates = sortedDates.slice(-5);
    let overallSum = 0;
    let overallCount = 0;
    const objAverages: Record<string, number> = {};

    (selectedGoal.objectives || []).forEach(obj => {
      let objSum = 0;
      let objCount = 0;
      last5Dates.forEach(date => {
        const values = groupedByDate[date][obj.id];
        if (values && values.length > 0) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          objSum += avg;
          objCount++;
          overallSum += avg;
          overallCount++;
        }
      });
      if (objCount > 0) {
        objAverages[obj.id] = objSum / objCount;
      }
    });

    const overallAverage = overallCount > 0 ? overallSum / overallCount : 0;

    return { 
      chartData, 
      interpretation: { overallAverage, objAverages, dataPointsCount: last5Dates.length } 
    };
  }, [selectedGoal, dataPoints]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const handleDelete = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Data Point',
      message: 'Are you sure you want to delete this data point?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'dataPoints', id));
          toast.success('Data point deleted');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `dataPoints/${id}`);
          toast.error('Failed to delete data point');
        }
        setConfirmConfig(null);
      }
    });
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {confirmConfig && (
        <ConfirmModal 
          isOpen={confirmConfig.isOpen} 
          title={confirmConfig.title} 
          message={confirmConfig.message} 
          onConfirm={confirmConfig.onConfirm} 
          onCancel={() => setConfirmConfig(null)} 
        />
      )}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{isHistory ? 'Historical Data' : 'Progress Graph'}</h1>
          <p className="text-muted-foreground">{student?.firstName} {student?.lastName}</p>
        </div>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="mb-6">
            <select 
              className="flex h-12 w-full md:w-96 items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium"
              value={selectedGoal?.id || ''}
              onChange={(e) => {
                const goal = goals.find(g => g.id === e.target.value);
                setSelectedGoal(goal || null);
              }}
            >
              <option value="" disabled>Select a goal to view progress...</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>[{g.domain}] {g.title}</option>
              ))}
            </select>
          </div>

          {selectedGoal ? (
            <div className="space-y-8">
              {chartData.length > 0 ? (
                <>
                  <div className="h-[400px] w-full mt-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fill: '#6b7280', fontSize: 12 }} 
                          tickLine={false}
                          axisLine={false}
                          dy={10}
                        />
                        <YAxis 
                          tick={{ fill: '#6b7280', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          dx={-10}
                          domain={selectedGoal.trackingType === 'percentage' ? [0, 100] : ['auto', 'auto']}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                          labelStyle={{ fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        
                        {/* Mastery Line */}
                        {selectedGoal.trackingType === 'percentage' && (
                          <ReferenceLine 
                            y={selectedGoal.masteryCriteria} 
                            stroke="#ef4444" 
                            strokeWidth={2} 
                            label={{ position: 'top', value: `Mastery (${selectedGoal.masteryCriteria}%)`, fill: '#ef4444', fontSize: 12 }} 
                          />
                        )}

                        {/* Overall Progress Line */}
                        <Line 
                          type="monotone" 
                          dataKey="overall" 
                          name="Overall Progress" 
                          stroke="#000000" 
                          strokeWidth={3} 
                          strokeDasharray="5 5"
                          dot={{ r: 4, fill: '#000000' }}
                          activeDot={{ r: 6 }}
                        />

                        {/* Individual Objectives */}
                        {(selectedGoal.objectives || []).map((obj, index) => (
                          <Line 
                            key={obj.id}
                            type="monotone" 
                            dataKey={obj.id} 
                            name={obj.title} 
                            stroke={COLORS[index % COLORS.length]} 
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Interpretation Panel */}
                  {interpretation && (
                    <div className="bg-muted/50 rounded-2xl p-6 border border-border">
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <ChartIcon className="w-5 h-5 text-primary" />
                        Data Interpretation
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Based on the last {interpretation.dataPointsCount} data collection days:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-4 rounded-xl shadow-sm">
                          <div className="text-sm text-muted-foreground mb-1">Overall Average</div>
                          <div className="text-3xl font-bold text-primary">
                            {interpretation.overallAverage.toFixed(1)}
                            {selectedGoal.trackingType === 'percentage' ? '%' : ''}
                          </div>
                        </div>
                        <div className="space-y-3">
                          {(selectedGoal.objectives || []).map((obj, index) => {
                            const avg = interpretation.objAverages[obj.id];
                            if (avg === undefined) return null;
                            return (
                              <div key={obj.id} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                  <span className="text-sm font-medium truncate max-w-[200px]">{obj.title}</span>
                                </div>
                                <span className="font-bold">
                                  {avg.toFixed(1)}{selectedGoal.trackingType === 'percentage' ? '%' : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-2xl border-2 border-dashed">
                  <ChartIcon className="w-12 h-12 mb-4 opacity-20" />
                  <p>No data available for this goal yet.</p>
                </div>
              )}

              {/* Data Table */}
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4">Data Points</h3>
                <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-border">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                      <tr>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Skill / Objective</th>
                        <th className="px-6 py-4">Value</th>
                        <th className="px-6 py-4">Recorded By</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dataPoints].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(dp => {
                        const obj = (selectedGoal.objectives || []).find(o => o.id === dp.objId);
                        const isEditing = editingId === dp.id;
                        return (
                          <tr key={dp.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-6 py-4">{format(parseISO(dp.timestamp), 'MMM dd, yyyy')}</td>
                            <td className="px-6 py-4">{obj?.title || 'Unknown'}</td>
                            <td className="px-6 py-4 font-mono">
                              {isEditing ? (
                                <Input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} className="w-24 h-8" />
                              ) : dp.value}
                            </td>
                            <td className="px-6 py-4">{dp.recordedBy}</td>
                            <td className="px-6 py-4 text-right">
                              {isEditing ? (
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                                  <Button variant="default" size="icon" onClick={() => handleSaveEdit(dp.id)}><Save className="w-4 h-4" /></Button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => { setEditingId(dp.id); setEditValue(dp.value.toString()); }}><Edit2 className="w-4 h-4 text-muted-foreground" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(dp.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {dataPoints.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No data points recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-2xl border-2 border-dashed">
              <ChartIcon className="w-12 h-12 mb-4 opacity-20" />
              <p>No data available for this goal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
