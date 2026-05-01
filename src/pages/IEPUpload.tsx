import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { collection, query, where, getDocs, addDoc, doc, setDoc, updateDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Student, Goal, DOMAIN_OPTIONS } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UploadCloud, CheckCircle2, UserPlus, AlertCircle, FileText, ArrowRight, Loader2, Save, X, Target } from 'lucide-react';
import { toast } from 'sonner';

export const IEPUpload = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Upload, 2: Parsing, 3: Match/Create Student, 4: Review Goals
  const [file, setFile] = useState<File | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [customApiKey, setCustomApiKey] = useState('');
  
  // Student matching
  const [matchedStudent, setMatchedStudent] = useState<Student | null>(null);
  const [useExisting, setUseExisting] = useState<boolean | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  // New Student state
  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    firstName: '',
    lastName: '',
    studentId: '',
    roomNumber: profile?.roomNumber || '',
    status: 'active'
  });

  // Goals state
  const [editableGoals, setEditableGoals] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);

  useEffect(() => {
    // Fetch students for the dropdown
    const fetchData = async () => {
      try {
        let studentQuery = query(collection(db, 'students'), where('status', '==', 'active'));
        if (profile?.role !== 'admin' && profile?.role !== 'editor') {
          if (profile?.roomNumber) {
            studentQuery = query(collection(db, 'students'), where('status', '==', 'active'), where('roomNumber', '==', profile.roomNumber));
          } else {
             return;
          }
        }
        const sDocs = await getDocs(studentQuery);
        const sList: Student[] = [];
        sDocs.forEach(s => sList.push({ id: s.id, ...s.data() } as Student));
        setAllStudents(sList);
      } catch (e) {
        console.error("Error fetching students", e);
      }
    };
    if (profile) {
      fetchData();
    }
  }, [profile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = async (selectedFile: File) => {
    if (!selectedFile.type.includes('pdf') && !selectedFile.type.includes('text')) {
      toast.error("Please upload a PDF or text file.");
      return;
    }
    setFile(selectedFile);
  };

  const processFile = async () => {
    if (!file) return;
    const f = file;
    setStep(2);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

      // Fetch goal bank to pass to the AI
      const bankDocs = await getDocs(query(collection(db, 'goalBank')));
      const goalBankData = bankDocs.docs.map(doc => ({
        title: doc.data().title,
        domain: doc.data().domain,
        objectives: doc.data().defaultObjectives?.map((o: any) => o.title)
      }));

      const res = await fetch('/api/gemini/extract-iep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mimeType: f.type,
          data: base64,
          apiKey: customApiKey || undefined,
          goalBank: goalBankData
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to extract data');
      }

      const json = await res.json();
      setParsedData(json);
      const extractedGoals = (json.goals || []).map((g: any) => ({ ...g, saveToBank: true }));
      setEditableGoals(extractedGoals);
      
      // Update new student state with found details
      setNewStudent(prev => ({
        ...prev,
        firstName: json.student?.firstName || '',
        lastName: json.student?.lastName || '',
        studentId: json.student?.studentId || ''
      }));

      // Look for match
      const fname = json.student?.firstName?.trim() || '';
      const lname = json.student?.lastName?.trim() || '';
      if (fname && lname) {
        let q;
        if (profile?.role === 'admin' || profile?.role === 'editor') {
          q = query(
            collection(db, 'students'), 
            where('firstName', '==', fname), 
            where('lastName', '==', lname)
          );
        } else if (profile?.roomNumber) {
          q = query(
            collection(db, 'students'), 
            where('firstName', '==', fname), 
            where('lastName', '==', lname),
            where('roomNumber', '==', profile.roomNumber)
          );
        }

        if (q) {
          const matchDocs = await getDocs(q);
          
          if (!matchDocs.empty) {
            const match = matchDocs.docs[0];
            setMatchedStudent({ id: match.id, ...(match.data() as any) } as Student);
            setSelectedStudentId(match.id);
            setUseExisting(true);
          } else {
            setUseExisting(false);
          }
        } else {
          setUseExisting(false);
        }
      }

      setStep(3);

    } catch (error: any) {
      console.error(error);
      toast.error(`Extraction failed: ${error.message}`);
      setStep(1);
      setFile(null);
    }
  };

  const handleStudentValidation = async () => {
    if (useExisting === true && !selectedStudentId) {
      toast.error('Please select an existing student to merge with.');
      return;
    }
    if (useExisting === false && (!newStudent.firstName || !newStudent.lastName || !newStudent.studentId || !newStudent.roomNumber)) {
      toast.error('Please fill out all new student fields.');
      return;
    }
    setStep(4);
  };

  const updateGoal = (index: number, field: string, value: any) => {
    setEditableGoals(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const updateObjective = (goalIdx: number, objIdx: number, value: string) => {
    setEditableGoals(prev => {
      const next = [...prev];
      next[goalIdx].objectives[objIdx].title = value;
      return next;
    });
  };

  const removeGoal = (index: number) => {
    setEditableGoals(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    try {
      let activeStudentId = '';

      if (useExisting && selectedStudentId) {
        activeStudentId = selectedStudentId;

        // Archive old goals
        const oldGoalsQuery = query(collection(db, 'goals'), where('studentId', '==', activeStudentId), where('status', '==', 'active'));
        const oldGoalsDocs = await getDocs(oldGoalsQuery);
        const updatePromises = oldGoalsDocs.docs.map(g => updateDoc(doc(db, 'goals', g.id), { status: 'archived' }));
        await Promise.all(updatePromises);
      } else {
        // Create new student
        const docRef = await addDoc(collection(db, 'students'), newStudent);
        activeStudentId = docRef.id;
      }

      // Add all goals
      const goalsPromises: Promise<any>[] = [];
      
      editableGoals.forEach((g) => {
        // Format objectives
        const objectives = (g.objectives || []).map((o: any, i: number) => ({
          id: Date.now().toString() + i + Math.random().toString().substr(2, 5),
          title: o.title || 'Untitled Objective'
        }));

        goalsPromises.push(addDoc(collection(db, 'goals'), {
          studentId: activeStudentId,
          title: g.title,
          domain: g.domain || DOMAIN_OPTIONS[0],
          trackingType: g.trackingType || 'percentage',
          masteryCriteria: g.masteryCriteria || 80,
          objectives: objectives,
          status: 'active'
        }));

        if (g.saveToBank) {
          goalsPromises.push(addDoc(collection(db, 'goalBank'), {
            title: g.title,
            domain: g.domain || DOMAIN_OPTIONS[0],
            trackingType: g.trackingType || 'percentage',
            defaultObjectives: objectives,
            status: profile?.role === 'admin' ? 'approved' : 'pending',
            submittedBy: profile?.email || 'system',
            submittedByName: profile?.name || 'System'
          }));
        }
      });

      await Promise.all(goalsPromises);
      toast.success('Successfully imported student and goals');
      navigate(`/student/${activeStudentId}`);

    } catch (error: any) {
      console.error(error);
      toast.error('Failed to save data. Please make sure you have the right permissions.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload IEP</h1>
        <p className="text-muted-foreground">Extract students and goals directly from documentation</p>
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="pt-6">
            <div 
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                isHovering ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsHovering(true); }}
              onDragLeave={() => setIsHovering(false)}
              onDrop={handleDrop}
            >
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">Drag and drop IEP file</h3>
              <p className="text-sm text-muted-foreground mb-6">Supports PDF or plain text</p>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                className="hidden" 
                accept="application/pdf, text/plain"
              />
              <Button onClick={() => fileInputRef.current?.click()} className="rounded-full px-8 mb-6">
                Browse Files
              </Button>
              
              <div className="max-w-sm mx-auto text-left border-t border-border pt-6 mt-2">
                <Label htmlFor="customApiKey" className="text-sm text-muted-foreground mb-2 block">
                  Optional: Use your own Gemini API Key
                </Label>
                <Input 
                  id="customApiKey"
                  type="password" 
                  placeholder="AIza..." 
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  className="bg-background mb-6"
                />

                {file && (
                  <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl mb-6">
                    <p className="font-medium text-sm text-primary mb-1">Selected File:</p>
                    <p className="text-sm truncate">{file.name}</p>
                  </div>
                )}
                
                <Button 
                  onClick={processFile} 
                  disabled={!file} 
                  className="w-full rounded-full"
                >
                  Process IEP <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="flex flex-col items-center justify-center p-12">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
          <h3 className="text-xl font-medium mb-1">Analyzing IEP document...</h3>
          <p className="text-sm text-muted-foreground">Extracting student info and relevant goals.</p>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Verify Student</CardTitle>
            <CardDescription>Confirm the student details extracted from the document.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted p-4 rounded-xl border border-border">
              <h4 className="text-sm font-semibold mb-2 uppercase tracking-wider text-muted-foreground">Extracted Name</h4>
              <p className="text-xl">{parsedData?.student?.firstName} {parsedData?.student?.lastName}</p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <Button 
                  variant={useExisting === true ? 'default' : 'outline'}
                  onClick={() => setUseExisting(true)}
                >
                  Merge with Existing Student
                </Button>
                <Button 
                  variant={useExisting === false ? 'default' : 'outline'}
                  onClick={() => setUseExisting(false)}
                >
                  Create New Student
                </Button>
              </div>

              {useExisting === true && (
                <div className="pt-4 border-t space-y-4">
                  <Label>Select Student to merge goals</Label>
                  <select 
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                  >
                    <option value="">Select a student...</option>
                    {allStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.firstName} {s.lastName} (Room {s.roomNumber})</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Goals extracted will be added as active, and old active goals will be archived.</p>
                </div>
              )}

              {useExisting === false && (
                <div className="pt-4 border-t space-y-4">
                  <h4 className="font-medium">New Student Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleStudentValidation} disabled={useExisting === null}>
                Continue to Goals <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-border">
            <div>
              <p className="font-medium">Reviewing IEP Goals</p>
              <p className="text-sm text-muted-foreground">For: {useExisting ? `${allStudents.find(s => s.id === selectedStudentId)?.firstName || ''} ${allStudents.find(s => s.id === selectedStudentId)?.lastName || ''}` : `${newStudent.firstName} ${newStudent.lastName}`}</p>
            </div>
            <Button onClick={handleSaveAll} className="px-6 rounded-full shadow-lg">
              <Save className="w-4 h-4 mr-2" /> Save {editableGoals.length} Goals
            </Button>
          </div>

          {editableGoals.map((goal, idx) => (
            <Card key={idx} className="border shadow-sm">
              <CardHeader className="pb-3 border-b bg-muted/20 relative">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                  onClick={() => removeGoal(idx)}
                >
                  <X className="w-4 h-4" />
                </Button>
                <CardTitle className="text-lg flex items-start gap-2 pr-8 w-full">
                  <Target className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <textarea 
                    value={goal.title} 
                    onChange={e => updateGoal(idx, 'title', e.target.value)} 
                    className="font-semibold text-lg bg-transparent border-0 px-2 w-full rounded-md h-24 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y"
                  />
                </CardTitle>
                <div className="flex items-center gap-2 pl-7 mt-2">
                  <input 
                    type="checkbox" 
                    id={`saveToBank-${idx}`} 
                    checked={goal.saveToBank !== false}
                    onChange={e => updateGoal(idx, 'saveToBank', e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                  />
                  <Label htmlFor={`saveToBank-${idx}`} className="text-sm cursor-pointer text-muted-foreground">Save as template to Goal Bank</Label>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Domain</Label>
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={goal.domain}
                      onChange={e => updateGoal(idx, 'domain', e.target.value)}
                    >
                      <option value="">Select Domain...</option>
                      {DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tracking Type</Label>
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
                      value={goal.trackingType}
                      onChange={e => updateGoal(idx, 'trackingType', e.target.value)}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="frequency">Frequency</option>
                      <option value="duration">Duration</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Mastery Criteria</Label>
                    <Input 
                      type="number"
                      value={goal.masteryCriteria}
                      onChange={e => updateGoal(idx, 'masteryCriteria', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Objectives (Sub-skills)</Label>
                  <div className="space-y-2 bg-muted/30 p-3 rounded-lg border">
                    {(goal.objectives || []).map((obj: any, objIdx: number) => (
                      <div key={objIdx} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-background flex items-center justify-center text-xs font-medium border text-muted-foreground shrink-0">
                          {objIdx + 1}
                        </div>
                        <Input 
                          value={obj.title} 
                          onChange={e => updateObjective(idx, objIdx, e.target.value)}
                          className="h-9 bg-background"
                        />
                      </div>
                    ))}
                    {(!goal.objectives || goal.objectives.length === 0) && (
                      <p className="text-sm text-muted-foreground">No objectives extracted.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {editableGoals.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              No goals extracted. You can abandon this upload or something went wrong.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
