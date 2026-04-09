import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Goal, Student, GoalBankItem, Objective, TrackingType, Domain } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Search, Archive, Target, Library, Trash2, Edit2, Settings } from 'lucide-react';
import { toast } from 'sonner';

export const GoalManagement = ({ isBankView = false }: { isBankView?: boolean }) => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [studentGoals, setStudentGoals] = useState<Goal[]>([]);
  const [goalBank, setGoalBank] = useState<GoalBankItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('All');

  // Builder State
  const [isBuilding, setIsBuilding] = useState(false);
  const [isBuildingBankItem, setIsBuildingBankItem] = useState(false);
  const [editingBankItemId, setEditingBankItemId] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState<Partial<Goal>>({
    title: '',
    domain: '',
    trackingType: 'percentage',
    masteryCriteria: 80,
    objectives: []
  });

  // Domain Management State
  const [isManagingDomains, setIsManagingDomains] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');

  useEffect(() => {
    const qDomains = query(collection(db, 'domains'));
    const unsubDomains = onSnapshot(qDomains, (snapshot) => {
      const domainsData: Domain[] = [];
      snapshot.forEach((doc) => {
        domainsData.push({ id: doc.id, ...doc.data() } as Domain);
      });
      // Sort alphabetically
      domainsData.sort((a, b) => a.name.localeCompare(b.name));
      setDomains(domainsData);
      
      // Set default domain if none selected
      if (domainsData.length > 0 && !newGoal.domain) {
        setNewGoal(prev => ({ ...prev, domain: domainsData[0].name }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'domains');
    });

    return () => unsubDomains();
  }, []);

  useEffect(() => {
    if (studentId && !isBankView) {
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
        where('studentId', '==', studentId)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const goalsData: Goal[] = [];
        snapshot.forEach((doc) => {
          goalsData.push({ id: doc.id, ...doc.data() } as Goal);
        });
        setStudentGoals(goalsData);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'goals');
      });

      return () => unsubscribe();
    }
  }, [studentId, isBankView]);

  useEffect(() => {
    const q = query(collection(db, 'goalBank'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bankData: GoalBankItem[] = [];
      snapshot.forEach((doc) => {
        bankData.push({ id: doc.id, ...doc.data() } as GoalBankItem);
      });
      setGoalBank(bankData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goalBank');
    });

    return () => unsubscribe();
  }, []);

  const filteredBank = goalBank.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDomain = selectedDomain === 'All' || item.domain === selectedDomain;
    const isApproved = item.status === 'approved';
    return matchesSearch && matchesDomain && isApproved;
  });

  const handleImportGoal = (bankItem: GoalBankItem) => {
    setNewGoal({
      title: bankItem.title,
      domain: bankItem.domain,
      trackingType: bankItem.trackingType,
      masteryCriteria: 80,
      objectives: [...bankItem.defaultObjectives]
    });
    setIsBuilding(true);
    setIsBuildingBankItem(false);
  };

  const handleEditBankItem = (bankItem: GoalBankItem) => {
    setNewGoal({
      title: bankItem.title,
      domain: bankItem.domain,
      trackingType: bankItem.trackingType,
      objectives: [...bankItem.defaultObjectives]
    });
    setEditingBankItemId(bankItem.id);
    setIsBuilding(true);
    setIsBuildingBankItem(true);
  };

  const handleDeleteBankItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this goal from the bank?')) return;
    try {
      await deleteDoc(doc(db, 'goalBank', id));
      toast.success('Goal removed from bank');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `goalBank/${id}`);
      toast.error('Failed to delete bank item');
    }
  };

  const handleSaveGoal = async () => {
    if ((!isBuildingBankItem && !studentId) || !newGoal.title || !newGoal.objectives?.length || !newGoal.domain) {
      toast.error('Please complete all required fields and add at least one objective.');
      return;
    }

    try {
      if (isBuildingBankItem) {
        const bankData: any = {
          title: newGoal.title,
          domain: newGoal.domain,
          trackingType: newGoal.trackingType,
          defaultObjectives: newGoal.objectives,
          status: profile?.role === 'admin' ? 'approved' : 'pending',
          submittedBy: profile?.email,
          submittedByName: profile?.name
        };

        if (editingBankItemId) {
          // Keep existing status if editing an approved item, unless admin
          const existing = goalBank.find(b => b.id === editingBankItemId);
          if (existing && profile?.role !== 'admin') {
            bankData.status = existing.status;
          }
          await updateDoc(doc(db, 'goalBank', editingBankItemId), bankData);
          toast.success('Bank goal updated');
        } else {
          await addDoc(collection(db, 'goalBank'), bankData);
          toast.success(profile?.role === 'admin' ? 'Goal added to bank' : 'Goal submitted for approval');
        }
      } else {
        await addDoc(collection(db, 'goals'), {
          studentId,
          title: newGoal.title,
          domain: newGoal.domain,
          trackingType: newGoal.trackingType,
          masteryCriteria: newGoal.masteryCriteria,
          objectives: newGoal.objectives,
          status: 'active'
        });
        toast.success('Goal added successfully');
      }
      setIsBuilding(false);
      setIsBuildingBankItem(false);
      setEditingBankItemId(null);
      setNewGoal({ title: '', domain: domains[0]?.name || '', trackingType: 'percentage', masteryCriteria: 80, objectives: [] });
    } catch (error) {
      handleFirestoreError(error, isBuildingBankItem ? (editingBankItemId ? OperationType.UPDATE : OperationType.CREATE) : OperationType.CREATE, isBuildingBankItem ? 'goalBank' : 'goals');
      toast.error('Failed to save goal');
    }
  };

  const handleArchiveGoal = async (goalId: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'goals', goalId), {
        status: currentStatus === 'active' ? 'archived' : 'active'
      });
      toast.success(`Goal ${currentStatus === 'active' ? 'archived' : 'unarchived'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
      toast.error('Failed to update goal status');
    }
  };

  const addObjective = () => {
    setNewGoal(prev => ({
      ...prev,
      objectives: [...(prev.objectives || []), { id: Date.now().toString(), title: '' }]
    }));
  };

  const updateObjective = (id: string, title: string) => {
    setNewGoal(prev => ({
      ...prev,
      objectives: prev.objectives?.map(obj => obj.id === id ? { ...obj, title } : obj)
    }));
  };

  const removeObjective = (id: string) => {
    setNewGoal(prev => ({
      ...prev,
      objectives: prev.objectives?.filter(obj => obj.id !== id)
    }));
  };

  const handleIEPReview = async () => {
    if (!confirm('Are you sure you want to archive all active goals? This is typically done during an IEP review.')) return;
    try {
      const activeGoals = studentGoals.filter(g => g.status === 'active');
      const promises = activeGoals.map(g => updateDoc(doc(db, 'goals', g.id), { status: 'archived' }));
      await Promise.all(promises);
      toast.success('All active goals have been archived.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'goals');
      toast.error('Failed to archive goals');
    }
  };

  const handleAddDomain = async () => {
    if (!newDomainName.trim()) return;
    try {
      await addDoc(collection(db, 'domains'), { name: newDomainName.trim() });
      setNewDomainName('');
      toast.success('Category added');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'domains');
      toast.error('Failed to add category');
    }
  };

  const handleDeleteDomain = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the category "${name}"? Existing goals will keep this category name, but it won't be available for new goals.`)) return;
    try {
      await deleteDoc(doc(db, 'domains', id));
      toast.success('Category deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `domains/${id}`);
      toast.error('Failed to delete category');
    }
  };

  if (isBankView && !isBuilding && !isManagingDomains) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Goal Bank</h1>
            <p className="text-muted-foreground">Browse and manage pre-written IEP goals</p>
          </div>
          <div className="flex gap-2">
            {(profile?.role === 'admin' || profile?.role === 'editor') && (
              <Button variant="outline" onClick={() => setIsManagingDomains(true)} className="rounded-full">
                <Settings className="w-4 h-4 mr-2" /> Categories
              </Button>
            )}
            {(profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'editor') && (
              <Button onClick={() => {
                setNewGoal({ title: '', domain: domains[0]?.name || '', trackingType: 'percentage', objectives: [] });
                setIsBuilding(true);
                setIsBuildingBankItem(true);
                setEditingBankItemId(null);
              }} className="rounded-full">
                <Plus className="w-4 h-4 mr-2" /> {profile?.role === 'admin' ? 'Add to Bank' : 'Suggest Goal'}
              </Button>
            )}
          </div>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
                <Input 
                  placeholder="Search goals..." 
                  className="pl-10 h-12 rounded-xl"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select 
                className="h-12 rounded-xl border border-input bg-background px-3 py-2 text-sm md:w-48"
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
              >
                <option value="All">All Categories</option>
                {domains.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBank.map(item => (
                <Card key={item.id} className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg leading-tight">{item.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full whitespace-nowrap">
                          {item.domain}
                        </span>
                        {(profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'editor') && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleEditBankItem(item)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteBankItem(item.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3 capitalize">Tracking: {item.trackingType}</p>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Sub-skills:</p>
                      <ul className="list-disc pl-4 text-sm text-muted-foreground">
                        {(item.defaultObjectives || []).map(obj => (
                          <li key={obj.id}>{obj.title}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredBank.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  No goals found matching your criteria.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isManagingDomains) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setIsManagingDomains(false)}>
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Manage Categories</h1>
            <p className="text-muted-foreground">Add or remove goal domains/categories</p>
          </div>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="p-6">
            <div className="flex gap-4 mb-8">
              <Input 
                placeholder="New category name..." 
                value={newDomainName}
                onChange={e => setNewDomainName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
                className="h-12 rounded-xl"
              />
              <Button onClick={handleAddDomain} className="h-12 rounded-xl px-6">
                <Plus className="w-4 h-4 mr-2" /> Add
              </Button>
            </div>

            <div className="space-y-2">
              {domains.map(domain => (
                <div key={domain.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border">
                  <span className="font-medium">{domain.name}</span>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteDomain(domain.id, domain.name)}>
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              ))}
              {domains.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No categories defined. Add one above.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Goal Management</h1>
          <p className="text-muted-foreground">{student?.firstName} {student?.lastName}</p>
        </div>
      </div>

      {!isBuilding ? (
        <Tabs defaultValue="active" className="w-full">
          <div className="flex justify-between items-center mb-4">
            <TabsList className="rounded-full h-12 p-1">
              <TabsTrigger value="active" className="rounded-full px-6">Active Goals</TabsTrigger>
              <TabsTrigger value="archived" className="rounded-full px-6">Archived</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleIEPReview} className="rounded-full h-12 px-6 text-amber-600 border-amber-200 hover:bg-amber-50">
                <Archive className="w-5 h-5 mr-2" />
                IEP Review (Archive All)
              </Button>
              <Button onClick={() => setIsBuilding(true)} className="rounded-full h-12 px-6">
                <Plus className="w-5 h-5 mr-2" />
                Add Goal
              </Button>
            </div>
          </div>

          <TabsContent value="active" className="space-y-4">
            {studentGoals.filter(g => g.status === 'active').map(goal => (
              <Card key={goal.id} className="border-0 shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">[{goal.domain}] {goal.title}</CardTitle>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">{goal.domain}</span>
                      <span className="text-xs font-medium bg-secondary/20 text-secondary-foreground px-2 py-1 rounded-full capitalize">{goal.trackingType}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleArchiveGoal(goal.id, goal.status)} title="Archive Goal">
                    <Archive className="w-5 h-5 text-muted-foreground" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
                    {(goal.objectives || []).map((obj, i) => (
                      <div key={obj.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-background text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
                          {i + 1}
                        </div>
                        <span className="text-sm">{obj.title}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {studentGoals.filter(g => g.status === 'active').length === 0 && (
              <div className="text-center py-12 bg-muted/30 rounded-3xl border-2 border-dashed">
                <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium">No Active Goals</h3>
                <p className="text-muted-foreground mt-1">Click "Add Goal" to get started.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="archived" className="space-y-4">
            {studentGoals.filter(g => g.status === 'archived').map(goal => (
              <Card key={goal.id} className="border-0 shadow-sm opacity-75">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-xl line-through text-muted-foreground">{goal.title}</CardTitle>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleArchiveGoal(goal.id, goal.status)}>
                    Unarchive
                  </Button>
                </CardHeader>
              </Card>
            ))}
            {studentGoals.filter(g => g.status === 'archived').length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No archived goals.</div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Goal Builder Form */}
          <Card className="lg:col-span-2 border-0 shadow-md order-2 lg:order-1">
            <CardHeader>
              <CardTitle>{isBuildingBankItem ? (editingBankItemId ? 'Edit Bank Goal' : 'Add to Goal Bank') : 'Goal Builder'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Goal Title</Label>
                <Input 
                  value={newGoal.title} 
                  onChange={e => setNewGoal({...newGoal, title: e.target.value})}
                  placeholder="e.g., Student will improve reading comprehension..."
                  className="h-12 rounded-xl"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category (Domain)</Label>
                  <select 
                    className="flex h-12 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={newGoal.domain}
                    onChange={e => setNewGoal({...newGoal, domain: e.target.value})}
                  >
                    {domains.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Tracking Type</Label>
                  <select 
                    className="flex h-12 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={newGoal.trackingType}
                    onChange={e => setNewGoal({...newGoal, trackingType: e.target.value as TrackingType})}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="frequency">Frequency (Count)</option>
                    <option value="duration">Duration (Time)</option>
                  </select>
                </div>
              </div>

              {!isBuildingBankItem && newGoal.trackingType === 'percentage' && (
                <div className="space-y-2">
                  <Label>Mastery Criteria (%)</Label>
                  <Input 
                    type="number" 
                    value={newGoal.masteryCriteria} 
                    onChange={e => setNewGoal({...newGoal, masteryCriteria: parseInt(e.target.value) || 0})}
                    className="h-12 rounded-xl w-32"
                  />
                </div>
              )}

              <div className="pt-4 border-t space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-lg">Sub-Skills (Objectives)</Label>
                  <Button variant="outline" size="sm" onClick={addObjective} className="rounded-full">
                    <Plus className="w-4 h-4 mr-1" /> Add Skill
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {newGoal.objectives?.map((obj, i) => (
                    <div key={obj.id} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                        {i + 1}
                      </div>
                      <Input 
                        value={obj.title}
                        onChange={e => updateObjective(obj.id, e.target.value)}
                        placeholder="Describe the sub-skill..."
                        className="h-12 rounded-xl"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeObjective(obj.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  ))}
                  {newGoal.objectives?.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No sub-skills added yet. Add at least one to track data.</p>
                  )}
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => {
                  setIsBuilding(false);
                  setIsBuildingBankItem(false);
                  setEditingBankItemId(null);
                }} className="rounded-full">Cancel</Button>
                <Button onClick={handleSaveGoal} className="rounded-full px-8">
                  {isBuildingBankItem ? (editingBankItemId ? 'Update Bank Goal' : (profile?.role === 'admin' ? 'Add to Bank' : 'Submit for Approval')) : 'Save Goal'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Goal Bank Sidebar */}
          <Card className="border-0 shadow-md bg-primary/5 order-1 lg:order-2 h-fit max-h-[800px] flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Library className="w-5 h-5 text-primary" />
                Import from Bank
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 pr-2">
              <Input 
                placeholder="Search bank..." 
                className="h-10 rounded-lg mb-4 bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {filteredBank.map(item => (
                <div key={item.id} className="p-3 bg-white rounded-xl shadow-sm border text-sm">
                  <div className="font-medium mb-1">[{item.domain}] {item.title}</div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-muted-foreground">{item.domain}</span>
                    <Button variant="secondary" size="sm" className="h-7 text-xs rounded-full" onClick={() => handleImportGoal(item)}>
                      Import
                    </Button>
                  </div>
                </div>
              ))}
              {filteredBank.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">No goals found.</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
