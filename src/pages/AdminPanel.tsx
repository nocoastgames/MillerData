import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, where, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Student, Role, Goal, DataPoint, GoalBankItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Save, X, Trash2, ShieldAlert, Library, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export const AdminPanel = () => {
  const navigate = useNavigate();
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

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState<Partial<UserProfile>>({
    name: '', email: '', role: 'teacher', roomNumber: '', status: 'active'
  });

  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [allDataPoints, setAllDataPoints] = useState<DataPoint[]>([]);
  const [goalBankItems, setGoalBankItems] = useState<GoalBankItem[]>([]);
  const [complianceTarget, setComplianceTarget] = useState(2);
  const [complianceMonth, setComplianceMonth] = useState(format(new Date(), 'yyyy-MM'));

  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  const toggleRoom = (room: string) => {
    const next = new Set(expandedRooms);
    if (next.has(room)) next.delete(room);
    else next.add(room);
    setExpandedRooms(next);
  };

  const toggleStudent = (studentId: string) => {
    const next = new Set(expandedStudents);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setExpandedStudents(next);
  };

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

    const qBank = query(collection(db, 'goalBank'));
    const unsubBank = onSnapshot(qBank, (snapshot) => {
      const bankData: GoalBankItem[] = [];
      snapshot.forEach((doc) => bankData.push({ id: doc.id, ...doc.data() } as GoalBankItem));
      setGoalBankItems(bankData);
    });

    return () => {
      unsubUsers();
      unsubStudents();
      unsubGoals();
      unsubBank();
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
      const dataToUpdate = {
        name: editUser.name,
        email: editUser.email?.toLowerCase().trim(),
        role: editUser.role,
        roomNumber: editUser.roomNumber || '',
        status: editUser.status
      };
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
      const dataToUpdate = {
        firstName: editStudent.firstName,
        lastName: editStudent.lastName,
        studentId: editStudent.studentId,
        roomNumber: editStudent.roomNumber,
        status: editStudent.status
      };
      await updateDoc(doc(db, 'students', id), dataToUpdate);
      toast.success('Student updated');
      setEditingStudentId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${id}`);
      toast.error('Failed to update student');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this user?')) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      toast.success('User deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${id}`);
      toast.error('Failed to delete user');
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.firstName || !newStudent.lastName || !newStudent.studentId || !newStudent.roomNumber) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      const studentData = {
        firstName: newStudent.firstName,
        lastName: newStudent.lastName,
        studentId: newStudent.studentId,
        roomNumber: newStudent.roomNumber,
        status: newStudent.status || 'active'
      };
      await addDoc(collection(db, 'students'), studentData);
      toast.success('Student added');
      setIsAddingStudent(false);
      setNewStudent({ firstName: '', lastName: '', studentId: '', roomNumber: '', status: 'active' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'students');
      toast.error('Failed to add student');
    }
  };

  const handleAddUser = async () => {
    const isRoomRequired = newUser.role === 'teacher' || newUser.role === 'para';
    if (!newUser.name || !newUser.email || !newUser.role || (isRoomRequired && !newUser.roomNumber)) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      // Use email as document ID
      const userEmail = newUser.email!.toLowerCase().trim();
      const userDocRef = doc(db, 'users', userEmail);
      
      const userData = {
        name: newUser.name,
        email: userEmail,
        role: newUser.role,
        roomNumber: newUser.roomNumber || '',
        status: newUser.status || 'active'
      };
      
      await setDoc(userDocRef, userData);
      toast.success('User added');
      setIsAddingUser(false);
      setNewUser({ name: '', email: '', role: 'teacher', roomNumber: '', status: 'active' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
      toast.error('Failed to add user');
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

  const handleApproveBankGoal = async (id: string) => {
    try {
      await updateDoc(doc(db, 'goalBank', id), { status: 'approved' });
      toast.success('Goal approved and added to bank');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goalBank/${id}`);
      toast.error('Failed to approve goal');
    }
  };

  const handleDeleteBankGoal = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this goal from the bank?')) return;
    try {
      await deleteDoc(doc(db, 'goalBank', id));
      toast.success('Goal deleted from bank');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `goalBank/${id}`);
      toast.error('Failed to delete goal');
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
          <TabsTrigger value="bank" className="rounded-full px-8">Goal Bank</TabsTrigger>
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
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newStudent.status}
                      onChange={e => setNewStudent({...newStudent, status: e.target.value as 'active' | 'archived'})}
                    >
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <ShieldAlert className="w-4 h-4" />
                Users must be added here before they can log in
              </div>
              <Button onClick={() => setIsAddingUser(true)} className="rounded-full">
                <Plus className="w-4 h-4 mr-2" /> Add User
              </Button>
            </div>
          </div>

          {isAddingUser && (
            <Card className="border-2 border-primary shadow-sm">
              <CardHeader className="bg-primary/5 pb-4">
                <CardTitle className="text-lg">Add New User</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={newUser.role}
                      onChange={e => setNewUser({...newUser, role: e.target.value as Role})}
                    >
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="para">Para</option>
                      <option value="editor">Editor</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Room Number {(newUser.role === 'admin' || newUser.role === 'editor') && '(Optional)'}</Label>
                    <Input value={newUser.roomNumber} onChange={e => setNewUser({...newUser, roomNumber: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newUser.status}
                      onChange={e => setNewUser({...newUser, status: e.target.value as 'active' | 'inactive'})}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsAddingUser(false)}>Cancel</Button>
                  <Button onClick={handleAddUser}>Save User</Button>
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
                              <Input 
                                value={editUser.roomNumber} 
                                onChange={e => setEditUser({...editUser, roomNumber: e.target.value})} 
                                className="w-20" 
                                placeholder={(editUser.role === 'admin' || editUser.role === 'editor') ? 'Optional' : ''}
                              />
                            ) : (
                              <span className="font-medium">{user.roomNumber || 'N/A'}</span>
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
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user.id)}>
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

        <TabsContent value="bank" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Goal Bank Management</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              <Library className="w-4 h-4" />
              Approve or edit goals submitted for the bank
            </div>
          </div>

          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                    <tr>
                      <th className="px-6 py-4">Goal Title</th>
                      <th className="px-6 py-4">Domain</th>
                      <th className="px-6 py-4">Submitted By</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goalBankItems.sort((a, b) => (a.status === 'pending' ? -1 : 1)).map((item) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-6 py-4">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.defaultObjectives.length} sub-skills
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-medium">
                            {item.domain}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">{item.submittedByName || 'System'}</div>
                          <div className="text-xs text-muted-foreground">{item.submittedBy}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`capitalize px-2 py-1 rounded-md text-xs font-medium ${
                            item.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {item.status === 'pending' && (
                              <Button variant="outline" size="sm" onClick={() => handleApproveBankGoal(item.id)} className="h-8 rounded-full text-green-600 border-green-200 hover:bg-green-50">
                                Approve
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/goal-bank`)}>
                              <Edit2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteBankGoal(item.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {goalBankItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                          No goals in the bank or pending approval.
                        </td>
                      </tr>
                    )}
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

          <div className="space-y-4">
            {Object.entries(
              students.reduce((acc, student) => {
                if (!acc[student.roomNumber]) acc[student.roomNumber] = [];
                acc[student.roomNumber].push(student);
                return acc;
              }, {} as Record<string, Student[]>)
            ).sort(([roomA], [roomB]) => roomA.localeCompare(roomB)).map(([room, roomStudentsData]) => {
              const roomStudents = roomStudentsData as Student[];
              const studentCompliance = roomStudents.map(student => {
                const studentGoals = allGoals.filter(g => g.studentId === student.id);
                if (studentGoals.length === 0) return true;
                return studentGoals.every(goal => {
                  const count = allDataPoints.filter(dp => dp.goalId === goal.id).length;
                  return count >= complianceTarget;
                });
              });
              const isRoomCompliant = studentCompliance.every(c => c);
              const isExpanded = expandedRooms.has(room);

              return (
                <Card key={room} className="border-0 shadow-sm overflow-hidden">
                  <div 
                    className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20'}`}
                    onClick={() => toggleRoom(room)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      <span className="font-bold text-lg">Room {room}</span>
                      <span className="text-sm text-muted-foreground">({roomStudents.length} Students)</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isRoomCompliant ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {isRoomCompliant ? 'Compliant' : 'Needs Data'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-white">
                      {roomStudents.map(student => {
                        const studentGoals = allGoals.filter(g => g.studentId === student.id);
                        const goalCompliance = studentGoals.map(goal => {
                          const count = allDataPoints.filter(dp => dp.goalId === goal.id).length;
                          return count >= complianceTarget;
                        });
                        const isStudentCompliant = studentGoals.length === 0 || goalCompliance.every(c => c);
                        const isStudentExpanded = expandedStudents.has(student.id);

                        return (
                          <div key={student.id} className="border-b last:border-0">
                            <div 
                              className={`flex items-center justify-between p-4 pl-12 cursor-pointer transition-colors ${isStudentExpanded ? 'bg-muted/10' : 'hover:bg-muted/5'}`}
                              onClick={() => toggleStudent(student.id)}
                            >
                              <div className="flex items-center gap-3">
                                {isStudentExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                <span className="font-medium">{student.firstName} {student.lastName}</span>
                                <span className="text-xs text-muted-foreground">({studentGoals.length} Goals)</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isStudentCompliant ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                {isStudentCompliant ? 'Compliant' : 'Needs Data'}
                              </span>
                            </div>

                            {isStudentExpanded && (
                              <div className="bg-muted/5 pl-20 pr-4 py-2 space-y-2">
                                {studentGoals.map(goal => {
                                  const count = allDataPoints.filter(dp => dp.goalId === goal.id).length;
                                  const isGoalCompliant = count >= complianceTarget;
                                  return (
                                    <div key={goal.id} className="flex items-center justify-between py-2 border-b border-muted last:border-0">
                                      <div className="flex-1 min-w-0 pr-4">
                                        <div className="text-sm font-medium truncate">
                                          <span className="text-primary font-bold mr-2">[{goal.domain}]</span>
                                          {goal.title}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 shrink-0">
                                        <div className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                          {count} / {complianceTarget} pts
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase ${isGoalCompliant ? 'text-green-600' : 'text-red-600'}`}>
                                          {isGoalCompliant ? 'OK' : 'Low'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                                {studentGoals.length === 0 && (
                                  <div className="text-xs text-muted-foreground italic py-2">No active goals</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
