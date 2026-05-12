import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Goal, Student, GoalBankItem, Objective, TrackingType, DOMAIN_OPTIONS } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { ArrowLeft, Plus, Search, Archive, Target, Library, Trash2, Edit2, Settings, Printer, Check, Merge, Wand2, Loader2, Sparkles, X } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

export const GoalManagement = ({ isBankView = false }: { isBankView?: boolean }) => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void} | null>(null);
  
  const [student, setStudent] = useState<Student | null>(null);
  const [studentGoals, setStudentGoals] = useState<Goal[]>([]);
  const [goalBank, setGoalBank] = useState<GoalBankItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('All');

  // Builder State
  const [isBuilding, setIsBuilding] = useState(false);
  const [isBuildingBankItem, setIsBuildingBankItem] = useState(false);
  const [editingBankItemId, setEditingBankItemId] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState<Partial<Goal>>({
    title: '',
    domain: DOMAIN_OPTIONS[0],
    skillLevel: 'Intermediate',
    trackingType: 'percentage',
    masteryCriteria: 80,
    objectives: []
  });
  const [saveToBank, setSaveToBank] = useState(false);

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectedForAction, setSelectedForAction] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<string>('');
  
  const [isCategoryMergeModalOpen, setIsCategoryMergeModalOpen] = useState(false);
  const [categoryMergeSource, setCategoryMergeSource] = useState<string>('');
  const [categoryMergeTarget, setCategoryMergeTarget] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProposals, setMergeProposals] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // AI Generation State
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiPromptSkills, setAiPromptSkills] = useState('');
  const [aiPromptPresentLevels, setAiPromptPresentLevels] = useState('');
  const [showAiGenerator, setShowAiGenerator] = useState(false);

  useEffect(() => {
    if (showAiGenerator) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showAiGenerator]);

  const handleGenerateAIGoal = async () => {
    if (!aiPromptSkills.trim()) {
      toast.error('Please enter the desired skills or needs');
      return;
    }
    
    setIsGeneratingAI(true);
    try {
      const res = await fetch('/api/gemini/generate-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          domain: newGoal.domain || 'Communication',
          skills: aiPromptSkills,
          presentLevels: aiPromptPresentLevels,
          studentAge: student ? `${student.grade || ''}` : '',
          apiKey: localStorage.getItem('GEMINI_API_KEY') || ''
        })
      });
      if (!res.ok) {
        const text = await res.text();
        let errorMsg = 'Failed to generate goal';
        try {
          const err = JSON.parse(text);
          errorMsg = err.error || errorMsg;
        } catch {
          errorMsg = text.includes('<!') ? `Server error (${res.status}): Please try again later.` : text;
        }
        throw new Error(errorMsg);
      }
      
      const generated = await res.json();
      setNewGoal(prev => ({
        ...prev,
        title: generated.title,
        domain: generated.domain && DOMAIN_OPTIONS.includes(generated.domain) ? generated.domain : prev.domain,
        skillLevel: generated.skillLevel || prev.skillLevel,
        trackingType: generated.trackingType || prev.trackingType,
        objectives: generated.objectives.map((o: any) => ({ title: o.title, id: Math.random().toString(36).substring(7) }))
      }));
      setAiPromptSkills('');
      setAiPromptPresentLevels('');
      setShowAiGenerator(false);
      toast.success('Draft goal generated successfully! Please review and modify as needed.');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

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
        console.error("Error fetching goals", error);
        handleFirestoreError(error, OperationType.LIST, 'goals');
      });

      return () => unsubscribe();
    }
  }, [studentId, isBankView]);

  useEffect(() => {
    const q = query(collection(db, 'goalBank'), where('status', 'in', ['pending', 'approved']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bankData: GoalBankItem[] = [];
      snapshot.forEach((doc) => {
        bankData.push({ id: doc.id, ...doc.data() } as GoalBankItem);
      });
      setGoalBank(bankData);
    }, (error) => {
      console.error("Error fetching goalBank", error);
      handleFirestoreError(error, OperationType.LIST, 'goalBank');
    });

    return () => unsubscribe();
  }, []);

  const normalizeDomain = (domain: string) => {
    const lower = domain.trim().toLowerCase();
    if (lower.includes('communication')) return 'Communication';
    return domain.trim() || 'Uncategorized';
  };

  const filteredBank = goalBank.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
    const itemDomain = normalizeDomain(item.domain || '');
    const matchesDomain = selectedDomain === 'All' || itemDomain.toLowerCase() === selectedDomain.toLowerCase() || itemDomain.toLowerCase().includes(selectedDomain.toLowerCase());
    const isVisible = item.status === 'approved' || profile?.role === 'admin' || item.submittedBy === profile?.email;
    return matchesSearch && matchesDomain && isVisible;
  });

  const availableDomains = Array.from(new Set([
    ...DOMAIN_OPTIONS,
    ...goalBank.map(item => normalizeDomain(item.domain || '')).filter(d => d.length > 0 && d !== 'Uncategorized')
  ])).sort();

  const goalsByDomainAndLevel = filteredBank.reduce((acc, goal) => {
    const domain = normalizeDomain(goal.domain || '');
    const skillLevel = goal.skillLevel || 'Intermediate';
    if (!acc[domain]) acc[domain] = { Basic: [], Intermediate: [], Advanced: [] };
    acc[domain][skillLevel].push(goal);
    return acc;
  }, {} as Record<string, Record<string, GoalBankItem[]>>);

  const handleImportGoal = (bankItem: GoalBankItem) => {
    let formattedTitle = bankItem.title;
    
    // Only format if we are importing for a specific student (not just building bank items)
    if (student) {
      const studentName = student.firstName || 'Student';
      let baseAction = bankItem.title;
      
      const lowerTitle = baseAction.toLowerCase();
      if (lowerTitle.startsWith('student will ')) {
        baseAction = bankItem.title.substring(13);
      } else if (lowerTitle.startsWith('the student will ')) {
        baseAction = bankItem.title.substring(17);
      }

      const masteryCriteria = 80;
      let criteriaText = '';
      if (bankItem.trackingType === 'percentage') {
        criteriaText = `to ${masteryCriteria}% accuracy`;
      } else if (bankItem.trackingType === 'frequency') {
        criteriaText = `for ${masteryCriteria} occurrences`;
      } else if (bankItem.trackingType === 'duration') {
        criteriaText = `for ${masteryCriteria} minutes`;
      } else {
        criteriaText = `to criteria`;
      }

      formattedTitle = `By annual review, ${studentName} will ${baseAction} ${criteriaText} supported by teaching staff.`;
    }

    setNewGoal({
      title: formattedTitle,
      domain: bankItem.domain,
      skillLevel: bankItem.skillLevel || 'Intermediate',
      trackingType: bankItem.trackingType,
      masteryCriteria: 80,
      objectives: [...bankItem.defaultObjectives]
    });
    setIsBuilding(true);
    setIsBuildingBankItem(false);
  };

  const handleApproveBankItem = async (id: string) => {
    try {
      await updateDoc(doc(db, 'goalBank', id), { status: 'approved' });
      toast.success('Goal approved');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goalBank/${id}`);
      toast.error('Failed to approve goal');
    }
  };

  const handleEditBankItem = (bankItem: GoalBankItem) => {
    setNewGoal({
      title: bankItem.title,
      domain: bankItem.domain,
      skillLevel: bankItem.skillLevel || 'Intermediate',
      trackingType: bankItem.trackingType,
      objectives: [...bankItem.defaultObjectives]
    });
    setEditingBankItemId(bankItem.id);
    setIsBuilding(true);
    setIsBuildingBankItem(true);
  };

  const handleAIMergeSelected = async () => {
    if (selectedForAction.length < 2) return;
    setIsMerging(true);
    try {
      const dbGoals = goalBank.filter(g => selectedForAction.includes(g.id));
      const res = await fetch('/api/gemini/merge-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalsToMerge: dbGoals, apiKey: localStorage.getItem('GEMINI_API_KEY') || '' })
      });
      if (!res.ok) {
        const text = await res.text();
        let errorMsg = 'Failed to merge goals';
        try {
          const err = JSON.parse(text);
          errorMsg = err.error || errorMsg;
        } catch {
          errorMsg = text.includes('<!') ? `Server error (${res.status}): Please try again later.` : text;
        }
        throw new Error(errorMsg);
      }
      
      const mergedGoal = await res.json();
      setNewGoal({
        title: mergedGoal.title,
        domain: mergedGoal.domain,
        skillLevel: mergedGoal.skillLevel || 'Intermediate',
        trackingType: mergedGoal.trackingType,
        masteryCriteria: 80,
        objectives: mergedGoal.objectives.map((o: any) => ({ ...o, id: Math.random().toString(36).substring(7) }))
      });
      // Clear selection and mode
      setSelectedForAction([]);
      setIsAdminMode(false);
      setIsBuildingBankItem(true);
      setEditingBankItemId(null);
      setIsBuilding(true);
      toast.success('Goals merged successfully! Please review the result.');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsMerging(false);
    }
  };

  const handleAnalyzeBank = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/gemini/analyze-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalBank: filteredBank, apiKey: localStorage.getItem('GEMINI_API_KEY') || '' })
      });
      if (!res.ok) {
        const text = await res.text();
        let errorMsg = 'Failed to analyze bank';
        try {
          const err = JSON.parse(text);
          errorMsg = err.error || errorMsg;
        } catch {
          errorMsg = text.includes('<!') ? `Server error (${res.status}): Please try again later.` : text;
        }
        throw new Error(errorMsg);
      }
      const data = await res.json();
      setMergeProposals(data.mergeProposals || []);
      if (data.mergeProposals?.length === 0) {
        toast.info('No merge suggestions found for these goals.');
      } else {
        toast.success(`Found ${data.mergeProposals.length} merge suggestions.`);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAcceptProposal = (proposal: any) => {
    setNewGoal({
      title: proposal.mergedGoal.title,
      domain: proposal.mergedGoal.domain,
      skillLevel: proposal.mergedGoal.skillLevel || 'Intermediate',
      trackingType: proposal.mergedGoal.trackingType,
      masteryCriteria: 80,
      objectives: proposal.mergedGoal.objectives.map((o: any) => ({ ...o, id: Math.random().toString(36).substring(7) }))
    });
    setIsBuildingBankItem(true);
    setEditingBankItemId(null);
    setIsBuilding(true);
    setMergeProposals(mergeProposals.filter(p => p !== proposal));
  };
  
  const handleToggleActionSelection = (id: string) => {
    setSelectedForAction(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleDeleteBankItem = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Goal from Bank',
      message: 'Are you sure you want to delete this goal from the bank?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'goalBank', id));
          toast.success('Goal removed from bank');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `goalBank/${id}`);
          toast.error('Failed to delete bank item');
        }
        setConfirmConfig(null);
      }
    });
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
          skillLevel: newGoal.skillLevel || 'Intermediate',
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
          skillLevel: newGoal.skillLevel || 'Intermediate',
          trackingType: newGoal.trackingType,
          masteryCriteria: newGoal.masteryCriteria,
          objectives: newGoal.objectives,
          status: 'active'
        });
        if (saveToBank) {
          await addDoc(collection(db, 'goalBank'), {
            title: newGoal.title,
            domain: newGoal.domain,
            skillLevel: newGoal.skillLevel || 'Intermediate',
            trackingType: newGoal.trackingType,
            defaultObjectives: newGoal.objectives,
            status: profile?.role === 'admin' ? 'approved' : 'pending',
            submittedBy: profile?.email || 'system',
            submittedByName: profile?.name || 'System'
          });
        }
        toast.success('Goal added successfully');
      }
      setIsBuilding(false);
      setIsBuildingBankItem(false);
      setEditingBankItemId(null);
      setSaveToBank(false);
      setNewGoal({ title: '', domain: DOMAIN_OPTIONS[0], skillLevel: 'Intermediate', trackingType: 'percentage', masteryCriteria: 80, objectives: [] });
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
    setConfirmConfig({
      isOpen: true,
      title: 'Archive Active Goals',
      message: 'Are you sure you want to archive all active goals? This is typically done during an IEP review.',
      onConfirm: async () => {
        try {
          const activeGoals = studentGoals.filter(g => g.status === 'active');
          const promises = activeGoals.map(g => updateDoc(doc(db, 'goals', g.id), { status: 'archived' }));
          await Promise.all(promises);
          toast.success('All active goals have been archived.');
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, 'goals');
          toast.error('Failed to archive goals');
        }
        setConfirmConfig(null);
      }
    });
  };

  const handleBulkChangeCategory = async () => {
    if (selectedForAction.length === 0 || !bulkCategory) return;
    try {
      const promises = selectedForAction.map(id => updateDoc(doc(db, 'goalBank', id), { domain: bulkCategory }));
      await Promise.all(promises);
      toast.success(`Successfully moved ${selectedForAction.length} goals to ${bulkCategory}`);
      setSelectedForAction([]);
      setBulkCategory('');
    } catch (error) {
      toast.error('Failed to move goals');
    }
  };

  const handleMergeCategories = async () => {
    if (!categoryMergeSource || !categoryMergeTarget || categoryMergeSource === categoryMergeTarget) {
      toast.error('Please select two distinct categories to merge');
      return;
    }
    setConfirmConfig({
      isOpen: true,
      title: 'Merge Categories',
      message: `Are you sure you want to merge ALL goals in '${categoryMergeSource}' into '${categoryMergeTarget}'? This will permanently update these goals.`,
      onConfirm: async () => {
        try {
          const goalsToUpdate = goalBank.filter(g => normalizeDomain(g.domain || '') === categoryMergeSource);
          const promises = goalsToUpdate.map(g => updateDoc(doc(db, 'goalBank', g.id), { domain: categoryMergeTarget }));
          await Promise.all(promises);
          toast.success(`Successfully merged ${goalsToUpdate.length} goals into ${categoryMergeTarget}`);
          setIsCategoryMergeModalOpen(false);
          setCategoryMergeSource('');
          setCategoryMergeTarget('');
        } catch (error) {
          toast.error('Failed to merge categories');
        }
        setConfirmConfig(null);
      }
    });
  };

  if (isBankView && !isBuilding) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {isCategoryMergeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-background border rounded-2xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Merge Categories</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsCategoryMergeModalOpen(false)} className="rounded-full">
                  <X className="w-5 h-5 text-slate-500" />
                </Button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label>Source Category (To be merged & removed)</Label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={categoryMergeSource}
                    onChange={e => setCategoryMergeSource(e.target.value)}
                  >
                    <option value="">Select source category...</option>
                    {availableDomains.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex justify-center text-slate-400">
                  <ArrowLeft className="w-5 h-5 rotate-[270deg]" />
                </div>
                <div className="space-y-2">
                  <Label>Target Category (To keep)</Label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={categoryMergeTarget}
                    onChange={e => setCategoryMergeTarget(e.target.value)}
                  >
                    <option value="">Select target category...</option>
                    {availableDomains.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                <Button variant="outline" onClick={() => setIsCategoryMergeModalOpen(false)}>Cancel</Button>
                <Button onClick={handleMergeCategories} disabled={!categoryMergeSource || !categoryMergeTarget || categoryMergeSource === categoryMergeTarget}>
                  Merge Categories
                </Button>
              </div>
            </div>
          </div>
        )}
        {confirmConfig && (
          <ConfirmModal 
            isOpen={confirmConfig.isOpen} 
            title={confirmConfig.title} 
            message={confirmConfig.message} 
            onConfirm={confirmConfig.onConfirm} 
            onCancel={() => setConfirmConfig(null)} 
          />
        )}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Goal Bank</h1>
            <p className="text-muted-foreground">Browse and manage pre-written IEP goals</p>
          </div>
          <div className="flex gap-2">
            {(profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'editor') && (
              <>
                {(profile?.role === 'admin' || profile?.role === 'editor') && (
                  <Button 
                    variant="outline"
                    onClick={() => setIsCategoryMergeModalOpen(true)}
                    className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 border-amber-200"
                  >
                    Merge Categories
                  </Button>
                )}
                <Button 
                  variant={isAdminMode ? 'default' : 'outline'}
                  onClick={() => {
                    setIsAdminMode(!isAdminMode);
                    setSelectedForAction([]);
                  }} 
                  className="rounded-full"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  {isAdminMode ? 'Exit Admin Tools' : 'Admin Tools'}
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleAnalyzeBank} 
                  disabled={isAnalyzing}
                  className="rounded-full"
                >
                  {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2 text-indigo-500" />}
                  Auto-Analyze
                </Button>
                <Button onClick={() => {
                  setNewGoal({ title: '', domain: DOMAIN_OPTIONS[0], skillLevel: 'Intermediate', trackingType: 'percentage', objectives: [] });
                  setIsBuilding(true);
                  setIsBuildingBankItem(true);
                  setEditingBankItemId(null);
                }} className="rounded-full">
                  <Plus className="w-4 h-4 mr-2" /> {profile?.role === 'admin' ? 'Add to Bank' : 'Suggest Goal'}
                </Button>
              </>
            )}
          </div>
        </div>

        {isAdminMode && (
          <Card className="border-indigo-200 bg-indigo-50 shadow-sm sticky top-4 z-10">
            <CardHeader className="py-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center">
                <CardTitle className="text-lg text-indigo-900 flex items-center shrink-0">
                  <Settings className="w-5 h-5 mr-2" />
                  Bulk Admin Actions
                </CardTitle>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <span className="text-sm font-medium text-indigo-700 whitespace-nowrap">
                    {selectedForAction.length} selected
                  </span>
                  
                  <div className="h-8 w-px bg-indigo-200 mx-2 hidden md:block"></div>
                  
                  <div className="flex items-center gap-2">
                    <select 
                      className="h-9 rounded-md border border-indigo-200 bg-white px-3 py-1 text-sm shrink-0"
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                    >
                      <option value="">Move to Category...</option>
                      {availableDomains.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <Button 
                      onClick={handleBulkChangeCategory} 
                      disabled={selectedForAction.length === 0 || !bulkCategory}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md h-9 px-4 shrink-0"
                    >
                      Move
                    </Button>
                  </div>

                  <div className="h-8 w-px bg-indigo-200 mx-2 hidden md:block"></div>

                  <Button 
                    onClick={handleAIMergeSelected} 
                    disabled={selectedForAction.length < 2 || isMerging}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md h-9 shrink-0"
                  >
                    {isMerging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Merge className="w-4 h-4 mr-2" />}
                    Compare & Merge
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {mergeProposals.length > 0 && !isAdminMode && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-indigo-900 flex items-center">
              <Wand2 className="w-5 h-5 mr-2 text-indigo-600" />
              AI Merge Suggestions
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {mergeProposals.map((proposal, idx) => (
                <Card key={idx} className="border-indigo-100 bg-white shadow-sm overflow-hidden">
                  <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 flex justify-between items-center">
                    <span className="text-sm font-medium text-indigo-800">Merge Suggestion</span>
                    <Button 
                      size="sm"
                      onClick={() => handleAcceptProposal(proposal)}
                      className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full"
                    >
                      <Check className="w-3 h-3 mr-1" /> Accept & Edit
                    </Button>
                  </div>
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Reason</p>
                      <p className="text-sm text-slate-700">{proposal.reason}</p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Original Goals to be Merged</p>
                        <ul className="list-disc pl-4 text-sm text-slate-600 space-y-1">
                          {proposal.originalGoalIds.map((id: string) => {
                            const original = goalBank.find(g => g.id === id);
                            return original ? <li key={id}>{original.title}</li> : null;
                          })}
                        </ul>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">Proposed Merged Goal</p>
                      <p className="text-sm font-medium text-slate-900 mb-2">{proposal.mergedGoal.title}</p>
                      <div className="flex gap-2 mb-3">
                        <span className="text-[10px] uppercase tracking-wider bg-slate-200 px-2 py-0.5 rounded-full">{proposal.mergedGoal.domain}</span>
                        <span className="text-[10px] uppercase tracking-wider bg-slate-200 px-2 py-0.5 rounded-full">{proposal.mergedGoal.skillLevel}</span>
                        <span className="text-[10px] uppercase tracking-wider bg-slate-200 px-2 py-0.5 rounded-full">{proposal.mergedGoal.trackingType}</span>
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Proposed Objectives</p>
                      <ul className="list-disc pl-4 text-sm text-slate-600">
                        {proposal.mergedGoal.objectives.map((obj: any, i: number) => (
                          <li key={i}>{obj.title}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

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
                {availableDomains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="space-y-4">
              {filteredBank.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground w-full">
                  No goals found matching your criteria.
                </div>
              ) : (
                <Accordion type="multiple" className="w-full space-y-4">
                  {Object.entries(goalsByDomainAndLevel).sort(([a], [b]) => a.localeCompare(b)).map(([domain, levels]) => {
                    const domainTotal = Object.values(levels).reduce((sum, goals) => sum + goals.length, 0);
                    return (
                    <AccordionItem key={domain} value={domain} className="border rounded-xl shadow-sm bg-white overflow-hidden px-4">
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center text-lg font-semibold">
                          {domain} <span className="ml-2 text-sm text-muted-foreground font-normal">({domainTotal})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-6 space-y-6">
                        {['Basic', 'Intermediate', 'Advanced'].map(skillLevel => {
                          const goals = (levels[skillLevel as keyof typeof levels] as GoalBankItem[]) || [];
                          if (goals.length === 0) return null;
                          return (
                            <div key={skillLevel} className="space-y-3">
                              <h3 className="text-md font-medium text-muted-foreground border-b pb-1 uppercase tracking-wider">{skillLevel} Skills</h3>
                              <div className="grid grid-cols-1 gap-4">
                                {goals.map(item => (
                                  <Card key={item.id} className="border shadow-sm">
                                    <CardHeader className="pb-2">
                                      <div className="flex justify-between items-start">
                                        <CardTitle className="text-lg leading-tight flex items-start gap-3">
                                          {isAdminMode && (
                                            <Checkbox 
                                              checked={selectedForAction.includes(item.id)}
                                              onCheckedChange={() => handleToggleActionSelection(item.id)}
                                              className="mt-1"
                                            />
                                          )}
                                          <div className="flex flex-wrap items-center gap-2">
                                            {item.title}
                                            {item.status === 'pending' && (
                                              <span className="text-[10px] font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                Pending
                                              </span>
                                            )}
                                          </div>
                                        </CardTitle>
                                        <div className="flex items-center gap-2">
                                          {(profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'editor') && (
                                            <div className="flex gap-1">
                                              {profile?.role === 'admin' && item.status === 'pending' && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => handleApproveBankItem(item.id)}>
                                                  <Check className="w-4 h-4" />
                                                </Button>
                                              )}
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
                                      <Accordion type="single" className="w-full">
                                        <AccordionItem value="details" className="border-none">
                                          <AccordionTrigger className="py-2 hover:no-underline px-0 text-sm font-medium text-muted-foreground">
                                            View Sub-skills & Details
                                          </AccordionTrigger>
                                          <AccordionContent className="pt-2 pb-0 px-0">
                                            <p className="text-sm text-muted-foreground mb-3 capitalize">Tracking: {item.trackingType}</p>
                                            <div className="space-y-1">
                                              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Sub-skills:</p>
                                              <ul className="list-disc pl-4 text-sm text-muted-foreground">
                                                {(item.defaultObjectives || []).map(obj => (
                                                  <li key={obj.id}>{obj.title}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          </AccordionContent>
                                        </AccordionItem>
                                      </Accordion>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </AccordionContent>
                    </AccordionItem>
                  )})}
                </Accordion>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }



  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {confirmConfig && (
        <ConfirmModal 
          isOpen={confirmConfig.isOpen} 
          title={confirmConfig.title} 
          message={confirmConfig.message} 
          onConfirm={confirmConfig.onConfirm} 
          onCancel={() => setConfirmConfig(null)} 
        />
      )}
      {showAiGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-indigo-900">Draft Goal with AI</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowAiGenerator(false)} className="rounded-full">
                <X className="w-5 h-5 text-slate-500" />
              </Button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Category (Domain)</Label>
                <select 
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newGoal.domain || 'Communication'}
                  onChange={e => setNewGoal({...newGoal, domain: e.target.value})}
                >
                  {DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Present Levels / Recent Report Card Notes</Label>
                <textarea 
                  value={aiPromptPresentLevels}
                  onChange={(e) => setAiPromptPresentLevels(e.target.value)}
                  placeholder="Paste teacher notes, present levels of performance, recent data, or report card comments here..."
                  className="w-full min-h-[120px] rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">Optional, but helps tailor the goal to the student's exact current performance.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Desired Skills / Target Needs <span className="text-red-500">*</span></Label>
                <textarea 
                  value={aiPromptSkills}
                  onChange={(e) => setAiPromptSkills(e.target.value)}
                  placeholder="e.g. Needs to ask for breaks, use a choice board, and greet peers..."
                  className="w-full min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleGenerateAIGoal();
                    }
                  }}
                />
                <p className="text-xs text-indigo-600">The AI will use the ({newGoal.domain || 'Communication'}) category, present levels, and desired skills to generate a SMART goal and its objectives. Press Ctrl+Enter to generate.</p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <Button variant="outline" onClick={() => setShowAiGenerator(false)} className="rounded-full">
                Cancel
              </Button>
              <Button 
                onClick={handleGenerateAIGoal} 
                disabled={isGeneratingAI || !aiPromptSkills.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6"
              >
                {isGeneratingAI ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Wand2 className="w-4 h-4 mr-2" /> Generate Goal & Objectives</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
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
              <Button variant="outline" onClick={() => navigate(`/student/${studentId}/print`)} className="rounded-full h-12 px-6">
                <Printer className="w-5 h-5 mr-2" />
                Print Data Sheet
              </Button>
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
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>{isBuildingBankItem ? (editingBankItemId ? 'Edit Bank Goal' : 'Add to Goal Bank') : 'Goal Builder'}</CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                className={`rounded-full transition-colors ${showAiGenerator ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : ''}`}
                onClick={() => setShowAiGenerator(!showAiGenerator)}
              >
                <Wand2 className="w-4 h-4 mr-2" /> 
                {showAiGenerator ? 'Close AI Draft' : 'Draft via AI'}
              </Button>
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
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Category (Domain)</Label>
                  <select 
                    className="flex h-12 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={newGoal.domain}
                    onChange={e => setNewGoal({...newGoal, domain: e.target.value})}
                  >
                    {DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Skill Level</Label>
                  <select 
                    className="flex h-12 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={newGoal.skillLevel || 'Intermediate'}
                    onChange={e => setNewGoal({...newGoal, skillLevel: e.target.value as any})}
                  >
                    <option value="Basic">Basic</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
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

              <div className="pt-6 flex items-center justify-between">
                {!isBuildingBankItem && (
                  <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id="saveToBankCheckbox"
                      checked={saveToBank}
                      onChange={(e) => setSaveToBank(e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <Label htmlFor="saveToBankCheckbox" className="text-sm cursor-pointer whitespace-nowrap">Save to Goal Bank</Label>
                  </div>
                )}
                <div className="flex justify-end gap-3 flex-1">
                  <Button variant="ghost" onClick={() => {
                    setIsBuilding(false);
                    setIsBuildingBankItem(false);
                    setEditingBankItemId(null);
                  }} className="rounded-full">Cancel</Button>
                  <Button onClick={handleSaveGoal} className="rounded-full px-8">
                    {isBuildingBankItem ? (editingBankItemId ? 'Update Bank Goal' : (profile?.role === 'admin' ? 'Add to Bank' : 'Submit for Approval')) : 'Save Goal'}
                  </Button>
                </div>
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
