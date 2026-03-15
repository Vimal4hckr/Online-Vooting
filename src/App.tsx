import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  BarChart3, 
  Vote, 
  CheckCircle2, 
  Clock, 
  Users, 
  ChevronRight,
  X,
  Loader2,
  Trophy,
  Search,
  Edit2,
  Lock,
  Unlock,
  Phone,
  User,
  Key,
  Trash2,
  Shield,
  Activity,
  LogOut,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Poll, Option, ServerMessage } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const VOTER_ID_KEY = 'voxpop_voter_id';

interface UserStats {
  votesCast: number;
  pollsCreated: number;
  activePolls: number;
}

interface UserActivity {
  title: string;
  poll_id: string;
  voted_at: string;
  choice: string;
}

export default function App() {
  const [view, setView] = useState<'feed' | 'admin'>('feed');
  const [polls, setPolls] = useState<Poll[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [voterId, setVoterId] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [isVoterAuthenticated, setIsVoterAuthenticated] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin State
  const [adminStats, setAdminStats] = useState<{ totalVotes: number, totalPolls: number, totalUsers: number, activePolls: number } | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [adminUserFilter, setAdminUserFilter] = useState<string>('all');
  const [userProfile, setUserProfile] = useState<{ voter_id: string, phone_number: string } | null>(null);

  // Login State
  const [loginVoterId, setLoginVoterId] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [adminId, setAdminId] = useState('');
  const [adminPass, setAdminPass] = useState('');

  // Poll Form State (Used for both Create and Edit)
  const [pollForm, setPollForm] = useState({
    title: '',
    description: '',
    options: [{ text: '', logo_url: '' }, { text: '', logo_url: '' }]
  });

  // Keep selectedPoll in sync with the polls array (for real-time updates)
  useEffect(() => {
    if (selectedPoll) {
      const updated = polls.find(p => p.id === selectedPoll.id);
      if (updated) {
        setSelectedPoll(updated);
      }
    }
  }, [polls]);

  const filteredPolls = useMemo(() => {
    if (!searchQuery.trim()) return polls;
    const q = searchQuery.toLowerCase();
    return polls.filter(p => 
      p.title.toLowerCase().includes(q) || 
      (p.description?.toLowerCase().includes(q))
    );
  }, [polls, searchQuery]);

  useEffect(() => {
    // Initialize Voter ID from localStorage if exists
    const storedVoterId = localStorage.getItem(VOTER_ID_KEY);
    const storedPhone = localStorage.getItem('voxpop_phone');
    
    if (storedVoterId && storedPhone) {
      setVoterId(storedVoterId);
      setPhoneNumber(storedPhone);
      setIsVoterAuthenticated(true);
    }

    // WebSocket Connection with Reconnection Logic
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket Connected');
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data: ServerMessage = JSON.parse(event.data);
          if (data.type === 'INIT' || data.type === 'UPDATE') {
            setPolls(data.polls);
            setLoading(false);
          }
        } catch (err) {
          console.error('Failed to parse WS message', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket Disconnected. Retrying...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  useEffect(() => {
    if (view === 'admin' && isAdminAuthenticated) {
      fetchAdminData();
    }
  }, [view, isAdminAuthenticated]);

  const filteredAdminUsers = useMemo(() => {
    if (adminUserFilter === 'all') return allUsers;
    return allUsers.filter(user => 
      user.participatedPolls?.some((p: any) => p.id === adminUserFilter)
    );
  }, [allUsers, adminUserFilter]);

  const fetchAdminData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/users')
      ]);
      if (statsRes.ok && usersRes.ok) {
        setAdminStats(await statsRes.json());
        setAllUsers(await usersRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId: adminId, password: adminPass })
      });
      if (res.ok) {
        setIsAdminAuthenticated(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Invalid password');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePoll = async (id: string) => {
    if (!confirm('Are you sure you want to delete this poll? This action is irreversible.')) return;
    try {
      const res = await fetch(`/api/admin/polls/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedPoll(null);
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(VOTER_ID_KEY);
    localStorage.removeItem('voxpop_phone');
    setVoterId('');
    setPhoneNumber('');
    setIsVoterAuthenticated(false);
    setIsAdminAuthenticated(false);
    setView('feed');
    setPollForm({ title: '', description: '', options: [{ text: '', logo_url: '' }, { text: '', logo_url: '' }] });
  };

  const handleVoterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation: Password must be 10 digits and numbers only
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(loginPhone)) {
      return alert('Password must be exactly 10 digits and contain only numbers.');
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/voter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId: loginVoterId, phoneNumber: loginPhone })
      });
      const data = await res.json();
      if (res.ok) {
        setVoterId(loginVoterId);
        setPhoneNumber(loginPhone);
        setIsVoterAuthenticated(true);
        localStorage.setItem(VOTER_ID_KEY, loginVoterId);
        localStorage.setItem('voxpop_phone', loginPhone);
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const filteredOptions = pollForm.options.filter(opt => opt.text.trim() !== '');
    
    if (pollForm.title.trim().length < 3) return alert('Voting Sector must be at least 3 characters');
    if (filteredOptions.length < 2) return alert('At least 2 non-empty party names required');

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pollForm.title,
          description: pollForm.description,
          options: filteredOptions,
          creatorId: isAdminAuthenticated ? adminId : voterId
        })
      });
      if (res.ok) {
        setIsCreating(false);
        setPollForm({ title: '', description: '', options: [{ text: '', logo_url: '' }, { text: '', logo_url: '' }] });
        if (view === 'admin' && isAdminAuthenticated) fetchAdminData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create poll');
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoll) return;

    const filteredOptions = pollForm.options.filter(opt => opt.text.trim() !== '');
    if (pollForm.title.trim().length < 3) return alert('Voting Sector must be at least 3 characters');
    if (filteredOptions.length < 2) return alert('At least 2 non-empty party names required');

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/polls/${selectedPoll.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pollForm.title,
          description: pollForm.description,
          options: filteredOptions
        })
      });
      if (res.ok) {
        setIsEditing(false);
        // The WebSocket will update the polls state
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update poll');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClosePoll = async (pollId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'closed' : 'active';
    const confirmMsg = newStatus === 'closed' 
      ? 'Are you sure you want to close this poll? No more votes will be accepted.' 
      : 'Reopen this poll?';
    
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update poll status');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId, optionId, voterId })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to vote');
      } else {
        if (view === 'admin' && isAdminAuthenticated) fetchAdminData();
        // Auto logout after voting if not in admin view
        if (view === 'feed') {
          alert('Vote cast successfully! You will now be logged out for security.');
          handleLogout();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('feed')} role="button" aria-label="VoxPop Home">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200" aria-hidden="true">
              <Vote size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">VoxPop</h1>
              <p className="text-[10px] uppercase tracking-widest text-black/40 font-semibold">Decentralized Trust</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-black/5 p-1 rounded-xl" aria-label="Main Navigation">
            <button 
              onClick={() => setView('feed')}
              aria-current={view === 'feed' ? 'page' : undefined}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                view === 'feed' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black"
              )}
            >
              Feed
            </button>
            <button 
              onClick={() => setView('admin')}
              aria-current={view === 'admin' ? 'page' : undefined}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                view === 'admin' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black"
              )}
            >
              Admin Panel
            </button>
          </nav>

          <div className="flex items-center gap-4">
            {isAdminAuthenticated && (
              <button 
                onClick={() => {
                  setPollForm({ title: '', description: '', options: ['', ''] });
                  setIsCreating(true);
                }}
                className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-black/80 transition-all active:scale-95 shadow-xl shadow-black/10"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Create Poll</span>
              </button>
            )}
            {(isVoterAuthenticated || isAdminAuthenticated) && (
              <button 
                onClick={handleLogout}
                className="p-2 text-black/40 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {view === 'feed' ? (
          !isVoterAuthenticated ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto py-20"
            >
              <div className="bg-white border border-black/5 p-10 rounded-[40px] shadow-2xl shadow-black/5">
                <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white mb-8 shadow-lg shadow-emerald-200 mx-auto">
                  <Vote size={32} />
                </div>
                <h2 className="text-3xl font-black tracking-tight text-center mb-2">Voter Login</h2>
                <p className="text-black/40 text-center mb-10 font-medium">Verify your identity to participate.</p>
                
                <form onSubmit={handleVoterLogin} className="space-y-6">
                  <div>
                    <label htmlFor="voter-id" className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Voter ID</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-black/20" size={18} aria-hidden="true" />
                      <input
                        id="voter-id"
                        required
                        value={loginVoterId}
                        onChange={(e) => setLoginVoterId(e.target.value)}
                        placeholder="Enter your Voter ID"
                        className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="voter-password" className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Password</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-black/20" size={18} aria-hidden="true" />
                      <input
                        id="voter-password"
                        required
                        type="password"
                        value={loginPhone}
                        onChange={(e) => setLoginPhone(e.target.value)}
                        placeholder="Enter 10-digit numeric password"
                        className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-black/80 transition-all active:scale-[0.98] shadow-xl shadow-black/10 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="animate-spin" size={18} />}
                    Verify & Enter
                  </button>
                </form>
              </div>
            </motion.div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <Loader2 className="animate-spin text-emerald-600" size={48} />
              <p className="text-black/40 font-medium italic">Synchronizing with ledger...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 p-8 rounded-3xl text-center">
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Poll List */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  Polls
                  <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full">{filteredPolls.length}</span>
                </h2>
                
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={18} aria-hidden="true" />
                  <input 
                    type="text"
                    placeholder="Search polls..."
                    aria-label="Search polls"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-black/5 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-6">
                <AnimatePresence mode='popLayout'>
                  {filteredPolls.map((poll) => (
                    <motion.div
                      key={poll.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => setSelectedPoll(poll)}
                      role="article"
                      aria-label={`Election: ${poll.title}`}
                      className={cn(
                        "group relative bg-white border border-black/5 p-6 rounded-3xl cursor-pointer transition-all hover:shadow-2xl hover:shadow-black/5 hover:-translate-y-1",
                        selectedPoll?.id === poll.id && "ring-2 ring-emerald-500 border-transparent"
                      )}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-bold group-hover:text-emerald-600 transition-colors">{poll.title}</h3>
                          <p className="text-sm text-black/50 line-clamp-2 mt-1">{poll.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {poll.status === 'closed' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-50 px-2 py-1 rounded-lg">
                              <Lock size={12} />
                              Closed
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-black/30 bg-black/5 px-2 py-1 rounded-lg">
                            <Clock size={12} />
                            {new Date(poll.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 mt-6 pt-6 border-t border-black/5">
                        <div className="flex items-center gap-2 text-sm font-medium text-black/60">
                          <Users size={16} className="text-emerald-500" />
                          <span>{poll.votes.reduce((acc, v) => acc + v.count, 0)} Votes</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-medium text-black/60">
                          <BarChart3 size={16} className="text-blue-500" />
                          <span>{poll.options.length} Options</span>
                        </div>
                        <div className="ml-auto">
                          <ChevronRight size={20} className="text-black/20 group-hover:text-emerald-500 transition-colors" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {polls.length === 0 && (
                  <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-black/10">
                    <p className="text-black/40 font-medium">No polls found. Be the first to start one!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar / Details */}
            <div className="lg:col-span-5">
              <div className="sticky top-28">
                {selectedPoll ? (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white border border-black/5 rounded-3xl p-8 shadow-2xl shadow-black/5"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-2xl font-bold tracking-tight">{selectedPoll.title}</h2>
                      <button 
                        onClick={() => setSelectedPoll(null)}
                        className="p-2 hover:bg-black/5 rounded-full transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        {selectedPoll.status === 'closed' ? (
                          <span className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-full flex items-center gap-1.5">
                            <Lock size={12} /> Closed
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest rounded-full flex items-center gap-1.5">
                            <Unlock size={12} /> Active
                          </span>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-black/30 bg-black/5 px-3 py-1 rounded-full flex items-center gap-1.5">
                          <User size={12} /> Creator: {selectedPoll.creator_id}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {(selectedPoll.creator_id === voterId || isAdminAuthenticated) && (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setPollForm({
                                  title: selectedPoll.title,
                                  description: selectedPoll.description || '',
                                  options: selectedPoll.options.map(o => ({ text: o.text, logo_url: o.logo_url || '' }))
                                });
                                setIsEditing(true);
                              }}
                              className="p-2 hover:bg-black/5 rounded-lg text-black/40 hover:text-emerald-600 transition-all"
                              title="Edit Poll"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleClosePoll(selectedPoll.id, selectedPoll.status)}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                selectedPoll.status === 'active' 
                                  ? "hover:bg-red-50 text-black/40 hover:text-red-500" 
                                  : "hover:bg-emerald-50 text-black/40 hover:text-emerald-500"
                              )}
                              title={selectedPoll.status === 'active' ? "Close Poll" : "Reopen Poll"}
                            >
                              {selectedPoll.status === 'active' ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>
                            {isAdminAuthenticated && (
                              <button 
                                onClick={() => handleDeletePoll(selectedPoll.id)}
                                className="p-2 hover:bg-red-50 text-black/40 hover:text-red-600 transition-all"
                                title="Delete Poll"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden mb-8" role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1 }}
                        className="h-full bg-emerald-500"
                      />
                    </div>

                    <p className="text-black/60 mb-8 leading-relaxed">{selectedPoll.description}</p>

                    <div className="space-y-4 mb-10" role="group" aria-label="Election Parties">
                      {selectedPoll.options.map((option) => {
                        const voteData = selectedPoll.votes.find(v => v.option_id === option.id);
                        const totalVotes = selectedPoll.votes.reduce((acc, v) => acc + v.count, 0);
                        const percentage = totalVotes > 0 ? Math.round((voteData?.count || 0) / totalVotes * 100) : 0;
                        const isClosed = selectedPoll.status === 'closed';

                        return (
                          <div
                            key={option.id}
                            className={cn(
                              "w-full group relative overflow-hidden border border-black/5 p-4 rounded-2xl text-left transition-all",
                              isClosed ? "bg-black/[0.02]" : "bg-[#F8F9FA]"
                            )}
                          >
                            <div 
                              className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 transition-all duration-500" 
                              style={{ width: `${percentage}%` }}
                            />
                            <div className="relative flex justify-between items-center gap-4">
                              <div className="flex items-center gap-4 flex-1">
                                {option.logo_url && (
                                  <div className="w-12 h-12 rounded-xl border border-black/5 bg-white flex-shrink-0 overflow-hidden">
                                    <img 
                                      src={option.logo_url} 
                                      alt={option.text} 
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                )}
                                <span className="font-bold text-sm text-black/80">{option.text}</span>
                              </div>
                              
                              <div className="flex items-center gap-6">
                                <div className="flex flex-col items-end" aria-live="polite">
                                  <motion.span 
                                    key={percentage}
                                    initial={{ scale: 1.2, color: '#10b981' }}
                                    animate={{ scale: 1, color: '#000000cc' }}
                                    className="text-xs font-black text-black/80"
                                  >
                                    {percentage}%
                                  </motion.span>
                                  <span className="text-[8px] font-bold uppercase tracking-tighter text-black/30">Progress</span>
                                </div>
                                
                                {!isClosed && (
                                  <button
                                    onClick={() => handleVote(selectedPoll.id, option.id)}
                                    aria-label={`Vote for ${option.text}`}
                                    className="bg-black text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-black/80 transition-all active:scale-[0.95] flex items-center gap-2"
                                  >
                                    Vote
                                  </button>
                                )}
                                
                                {isClosed && (
                                  <div className="w-8 h-8 rounded-full bg-white border border-black/5 flex items-center justify-center text-black/20">
                                    <CheckCircle2 size={16} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Analytics Chart */}
                    <div className="mt-10 pt-10 border-t border-black/5">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-black/40 mb-6 flex items-center gap-2">
                        <BarChart3 size={14} />
                        Live Distribution
                      </h4>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={selectedPoll.options.map(opt => ({
                            name: opt.text,
                            votes: selectedPoll.votes.find(v => v.option_id === opt.id)?.count || 0
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00000008" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: '#00000040', fontWeight: 600 }}
                            />
                            <Tooltip 
                              cursor={{ fill: '#00000005' }}
                              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
                              {selectedPoll.options.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="bg-emerald-600 rounded-3xl p-10 text-white shadow-2xl shadow-emerald-200 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                      <Trophy size={120} />
                    </div>
                    <h3 className="text-2xl font-bold mb-4 relative z-10">Welcome to VoxPop</h3>
                    <p className="text-emerald-100/80 mb-8 relative z-10 leading-relaxed">
                      Select a poll from the list to view detailed results and cast your vote. 
                      Your voice matters in our transparent, real-time ecosystem.
                    </p>
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center gap-3 bg-white/10 p-3 rounded-xl">
                        <CheckCircle2 size={20} className="text-emerald-300" />
                        <span className="text-sm font-medium">One vote per session</span>
                      </div>
                      <div className="flex items-center gap-3 bg-white/10 p-3 rounded-xl">
                        <BarChart3 size={20} className="text-emerald-300" />
                        <span className="text-sm font-medium">Real-time analytics</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : !isAdminAuthenticated ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto py-20"
          >
            <div className="bg-white border border-black/5 p-10 rounded-[40px] shadow-2xl shadow-black/5">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center text-white mb-8 shadow-lg shadow-black/10 mx-auto">
                <Shield size={32} />
              </div>
              <h2 className="text-3xl font-black tracking-tight text-center mb-2">Admin Panel</h2>
              <p className="text-black/40 text-center mb-10 font-medium">Secure access for system administrators.</p>
              
              <form onSubmit={handleAdminLogin} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Admin ID</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-black/20" size={18} />
                    <input
                      required
                      value={adminId}
                      onChange={(e) => setAdminId(e.target.value)}
                      placeholder="Enter admin ID"
                      className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-black outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Admin Password</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-black/20" size={18} />
                    <input
                      required
                      type="password"
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      placeholder="Enter admin password"
                      className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-black outline-none transition-all"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-black/80 transition-all active:scale-[0.98] shadow-xl shadow-black/10 flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="animate-spin" size={18} />}
                  Unlock Admin Panel
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            {/* Admin Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h2 className="text-4xl font-extrabold tracking-tight mb-2">Admin Control Center</h2>
                <p className="text-black/40 font-medium">Global system overview and management tools.</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    setPollForm({ title: '', description: '', options: ['', ''] });
                    setIsCreating(true);
                  }}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95"
                >
                  <Plus size={20} />
                  <span className="font-bold">Create New Poll</span>
                </button>
                <div className="flex items-center gap-3 bg-black text-white px-6 py-3 rounded-2xl shadow-xl shadow-black/10">
                  <Shield size={20} className="text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-widest">Administrator Mode</span>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Total Votes', value: adminStats?.totalVotes || 0, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Total Polls', value: adminStats?.totalPolls || 0, icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Registered Users', value: adminStats?.totalUsers || 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Active Polls', value: adminStats?.activePolls || 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map((stat, i) => (
                <div key={i} className="bg-white border border-black/5 p-8 rounded-[32px] shadow-sm hover:shadow-xl transition-all group">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", stat.bg, stat.color)}>
                    <stat.icon size={24} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-black/40 mb-1">{stat.label}</p>
                  <h3 className="text-4xl font-black tracking-tight">{stat.value}</h3>
                </div>
              ))}
            </div>

            {/* Users & Recent Polls */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white border border-black/5 rounded-[32px] p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users size={20} className="text-purple-500" />
                    Registered Voters
                  </h3>
                  
                  <div className="flex items-center gap-2 bg-[#F8F9FA] border border-black/5 rounded-xl px-3 py-2">
                    <Filter size={14} className="text-black/40" />
                    <select 
                      value={adminUserFilter}
                      onChange={(e) => setAdminUserFilter(e.target.value)}
                      className="bg-transparent text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="all">All Voters</option>
                      {polls.map(poll => (
                        <option key={poll.id} value={poll.id}>
                          {poll.title.length > 20 ? poll.title.substring(0, 20) + '...' : poll.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredAdminUsers.length > 0 ? filteredAdminUsers.map((user, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-[#F8F9FA] border border-black/5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black/20 border border-black/5">
                          <User size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{user.voter_id}</p>
                          <p className="text-xs text-black/40 font-medium">{user.phone_number}</p>
                          {user.participatedPolls && user.participatedPolls.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {user.participatedPolls.map((p: any) => (
                                <span key={p.id} className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold">
                                  {p.title.length > 15 ? p.title.substring(0, 15) + '...' : p.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-black/30">Verified</span>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-12">
                      <p className="text-black/30 font-medium italic">No voters found for this filter.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-black/5 rounded-[32px] p-8 shadow-sm">
                <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                  <Activity size={20} className="text-emerald-500" />
                  System Polls
                </h3>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {polls.map((poll) => (
                    <div 
                      key={poll.id}
                      onClick={() => { setView('feed'); setSelectedPoll(poll); }}
                      className="group flex items-center justify-between p-4 rounded-2xl hover:bg-black/5 cursor-pointer transition-all border border-transparent hover:border-black/5"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          poll.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                        )}>
                          {poll.status === 'active' ? <Unlock size={18} /> : <Lock size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold group-hover:text-emerald-600 transition-colors">{poll.title}</p>
                          <p className="text-xs text-black/40">{poll.votes.reduce((acc, v) => acc + v.count, 0)} total votes</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-black/20 group-hover:text-emerald-500 transition-all" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Create / Edit Poll Modal */}
      <AnimatePresence>
        {(isCreating || isEditing) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsCreating(false); setIsEditing(false); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              className="relative bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-black/5 flex justify-between items-center">
                <h2 id="modal-title" className="text-2xl font-bold tracking-tight">
                  {isEditing ? 'Edit Poll' : 'Create New Poll'}
                </h2>
                <button 
                  onClick={() => { setIsCreating(false); setIsEditing(false); }} 
                  aria-label="Close modal"
                  className="p-2 hover:bg-black/5 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={isEditing ? handleUpdatePoll : handleCreatePoll} className="p-8 space-y-6">
                {isEditing && selectedPoll && selectedPoll.votes.reduce((acc, v) => acc + v.count, 0) > 0 && (
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 text-amber-700 text-xs font-medium" role="alert">
                    <Shield size={16} aria-hidden="true" />
                    This election has votes. Description and parties are locked for integrity.
                  </div>
                )}
                <div>
                  <label htmlFor="poll-title" className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Voting Sector</label>
                  <input
                    id="poll-title"
                    required
                    autoFocus
                    value={pollForm.title}
                    onChange={(e) => setPollForm({ ...pollForm, title: e.target.value })}
                    placeholder="e.g., Election Name"
                    className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Description</label>
                  <textarea
                    value={pollForm.description}
                    disabled={isEditing && selectedPoll && selectedPoll.votes.reduce((acc, v) => acc + v.count, 0) > 0}
                    onChange={(e) => setPollForm({ ...pollForm, description: e.target.value })}
                    placeholder="Provide context for this election..."
                    className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-24 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">Party Name and Logos</label>
                  <div className="space-y-4">
                    {pollForm.options.map((opt, idx) => (
                      <div key={idx} className="flex flex-col gap-2 p-4 bg-[#F8F9FA] border border-black/5 rounded-2xl">
                        <div className="flex items-center gap-2">
                          <input
                            required
                            disabled={isEditing && selectedPoll && selectedPoll.votes.reduce((acc, v) => acc + v.count, 0) > 0}
                            value={opt.text}
                            onChange={(e) => {
                              const next = [...pollForm.options];
                              next[idx] = { ...next[idx], text: e.target.value };
                              setPollForm({ ...pollForm, options: next });
                            }}
                            placeholder={`Party Name ${idx + 1}`}
                            className="flex-1 bg-white border border-black/5 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          {pollForm.options.length > 2 && !(isEditing && selectedPoll && selectedPoll.votes.reduce((acc, v) => acc + v.count, 0) > 0) && (
                            <button
                              type="button"
                              onClick={() => setPollForm({ ...pollForm, options: pollForm.options.filter((_, i) => i !== idx) })}
                              className="p-2 text-black/20 hover:text-red-500 transition-colors"
                            >
                              <X size={18} />
                            </button>
                          )}
                        </div>
                        <input
                          disabled={isEditing && selectedPoll && selectedPoll.votes.reduce((acc, v) => acc + v.count, 0) > 0}
                          value={opt.logo_url}
                          onChange={(e) => {
                            const next = [...pollForm.options];
                            next[idx] = { ...next[idx], logo_url: e.target.value };
                            setPollForm({ ...pollForm, options: next });
                          }}
                          placeholder="Logo URL (optional)"
                          className="w-full bg-white border border-black/5 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    ))}
                    {!(isEditing && selectedPoll && selectedPoll.votes.reduce((acc, v) => acc + v.count, 0) > 0) && (
                      <button
                        type="button"
                        onClick={() => setPollForm({ ...pollForm, options: [...pollForm.options, { text: '', logo_url: '' }] })}
                        className="text-emerald-600 text-sm font-bold flex items-center gap-1 hover:underline"
                      >
                        <Plus size={14} />
                        Add Party
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-black/80 transition-all active:scale-[0.98] shadow-xl shadow-black/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="animate-spin" size={18} />}
                    {isEditing ? 'Update Election' : 'Launch Election'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
