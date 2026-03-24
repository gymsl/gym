import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  UserPlus, 
  Clock, 
  Settings as SettingsIcon, 
  CreditCard, 
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { ref, onValue, set, push, update } from 'firebase/database';
import { format, startOfDay, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { db } from './firebase';
import { Member, Session, GymSettings } from './types';
import { cn } from './lib/utils';

// --- Components ---

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden", className)}>
    {children}
  </div>
);

const StatCard = ({ title, value, icon: Icon, trend, color }: { title: string, value: string | number, icon: any, trend?: string, color: string }) => (
  <Card className="p-6">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</p>
        <h3 className="text-3xl font-bold mt-2 text-slate-900">{value}</h3>
        {trend && (
          <p className="text-xs font-medium text-emerald-600 mt-2 flex items-center gap-1">
            <TrendingUp size={12} /> {trend}
          </p>
        )}
      </div>
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon className="text-white" size={24} />
      </div>
    </div>
  </Card>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attendance' | 'members' | 'register' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<GymSettings>({ gymName: 'Brothers Gym', chargePerMinute: 2.0 });
  const [nfcSupported, setNfcSupported] = useState<boolean>(false);
  const [nfcStatus, setNfcStatus] = useState<'idle' | 'reading' | 'writing' | 'error'>('idle');
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [lastScannedTag, setLastScannedTag] = useState<string | null>(null);

  // Firebase Listeners
  useEffect(() => {
    const membersRef = ref(db, 'members');
    const sessionsRef = ref(db, 'sessions');
    const settingsRef = ref(db, 'settings');

    const unsubMembers = onValue(membersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setMembers(Object.values(data));
      } else {
        setMembers([]);
      }
    });

    const unsubSessions = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const allSessions: Session[] = Object.values(data);
        setActiveSessions(allSessions.filter(s => !s.checkOut));
        setPastSessions(allSessions.filter(s => s.checkOut).sort((a, b) => (b.checkOut || 0) - (a.checkIn || 0)));
      } else {
        setActiveSessions([]);
        setPastSessions([]);
      }
    });

    const unsubSettings = onValue(settingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSettings(data);
      }
    });

    // Check NFC Support
    if ('NDEFReader' in window) {
      setNfcSupported(true);
    }

    return () => {
      unsubMembers();
      unsubSessions();
      unsubSettings();
    };
  }, []);

  // NFC Reading Logic for Attendance
  const startNfcScan = async () => {
    if (!nfcSupported) return;
    
    try {
      setNfcStatus('reading');
      const reader = new (window as any).NDEFReader();
      await reader.scan();
      
      reader.onreading = ({ serialNumber }: any) => {
        console.log(`> Serial Number: ${serialNumber}`);
        handleAttendance(serialNumber);
      };

      reader.onreadingerror = () => {
        setNfcStatus('error');
        setNfcError('NFC Read error. Try again.');
      };
    } catch (error) {
      setNfcStatus('error');
      setNfcError('NFC Scan failed. Make sure NFC is enabled and you are on mobile Chrome.');
    }
  };

  const handleAttendance = async (tagId: string) => {
    // 1. Find member
    const member = members.find(m => m.id === tagId);
    if (!member) {
      setNfcStatus('error');
      setNfcError("Member not found. Please register this tag first.");
      return;
    }

    // 2. Check if active session exists
    const activeSession = activeSessions.find(s => s.memberId === tagId);

    if (activeSession) {
      // Check-out
      const checkOutTime = Date.now();
      const durationMs = checkOutTime - activeSession.checkIn;
      const durationMinutes = Math.max(1, Math.ceil(durationMs / (1000 * 60)));
      const cost = durationMinutes * settings.chargePerMinute;

      await update(ref(db, `sessions/${activeSession.id}`), {
        checkOut: checkOutTime,
        durationMinutes,
        cost
      });
      
      setLastScannedTag(`Checked out: ${member.name}. Cost: Rs. ${cost.toFixed(2)}`);
    } else {
      // Check-in
      const newSessionRef = push(ref(db, 'sessions'));
      const newSession: Session = {
        id: newSessionRef.key!,
        memberId: tagId,
        memberName: member.name,
        checkIn: Date.now()
      };
      await set(newSessionRef, newSession);
      setLastScannedTag(`Checked in: ${member.name}`);
    }
    
    setNfcStatus('idle');
    // Reset status after success
    setTimeout(() => setLastScannedTag(null), 5000);
  };

  // --- Views ---

  const DashboardView = () => {
    const today = startOfDay(new Date());
    const todaySessions = pastSessions.filter(s => s.checkOut && isSameDay(new Date(s.checkOut), today));
    const dailyIncome = todaySessions.reduce((acc, s) => acc + (s.cost || 0), 0);

    // Chart Data
    const chartData = Array.from({ length: 7 }).map((_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const daySessions = pastSessions.filter(s => s.checkOut && isSameDay(new Date(s.checkOut), date));
      return {
        name: format(date, 'EEE'),
        income: daySessions.reduce((acc, s) => acc + (s.cost || 0), 0),
        attendance: daySessions.length + activeSessions.filter(s => isSameDay(new Date(s.checkIn), date)).length
      };
    });

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Active Now" 
            value={activeSessions.length} 
            icon={Wifi} 
            color="bg-blue-500" 
          />
          <StatCard 
            title="Total Members" 
            value={members.length} 
            icon={Users} 
            color="bg-indigo-500" 
          />
          <StatCard 
            title="Today's Income" 
            value={`Rs. ${dailyIncome.toFixed(2)}`} 
            icon={DollarSign} 
            color="bg-emerald-500" 
            trend="+12% from yesterday"
          />
          <StatCard 
            title="Today's Attendance" 
            value={todaySessions.length + activeSessions.length} 
            icon={Clock} 
            color="bg-orange-500" 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Weekly Activity</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Active Sessions</h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {activeSessions.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <WifiOff size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No active sessions at the moment</p>
                </div>
              ) : (
                activeSessions.map(session => (
                  <div key={session.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                        {session.memberName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{session.memberName}</p>
                        <p className="text-xs text-slate-500">Started at {format(session.checkIn, 'hh:mm a')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-medium text-indigo-600">
                        {Math.max(1, Math.ceil((Date.now() - session.checkIn) / 60000))} mins
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Duration</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const AttendanceView = () => {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <Card className="p-8 text-center">
          <div className="mb-8">
            <div className={cn(
              "w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 transition-all duration-500",
              nfcStatus === 'reading' ? "bg-indigo-100 animate-pulse" : "bg-slate-100"
            )}>
              <Wifi className={cn(
                "transition-all duration-500",
                nfcStatus === 'reading' ? "text-indigo-600 scale-125" : "text-slate-400"
              )} size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">NFC Attendance</h2>
            <p className="text-slate-500 mt-2">Tap member card to check-in or check-out</p>
          </div>

          {!nfcSupported ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm flex items-start gap-3 text-left">
              <AlertCircle size={20} className="shrink-0" />
              <p>Web NFC is not supported on this device/browser. Please use Chrome on Android for full functionality.</p>
            </div>
          ) : (
            <button 
              onClick={startNfcScan}
              disabled={nfcStatus === 'reading'}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {nfcStatus === 'reading' ? 'Scanning...' : 'Start Scanner'}
            </button>
          )}

          <AnimatePresence>
            {lastScannedTag && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-medium"
              >
                <CheckCircle2 size={20} className="inline-block mr-2" />
                {lastScannedTag}
              </motion.div>
            )}
            {nfcError && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 font-medium"
              >
                <XCircle size={20} className="inline-block mr-2" />
                {nfcError}
                <button onClick={() => setNfcError(null)} className="block mx-auto mt-2 text-xs underline">Dismiss</button>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {pastSessions.length === 0 ? (
              <p className="text-center py-4 text-slate-400 text-sm">No recent activity</p>
            ) : (
              pastSessions.slice(0, 5).map(session => (
                <div key={session.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                      {session.memberName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{session.memberName}</p>
                      <p className="text-[10px] text-slate-400">{session.checkOut ? format(session.checkOut, 'MMM dd, hh:mm a') : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">Rs. {session.cost?.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">{session.durationMinutes} mins</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    );
  };

  const RegisterView = () => {
    const [formData, setFormData] = useState({ name: '', whatsapp: '', nic: '' });
    const [isProgramming, setIsProgramming] = useState(false);
    const [tagId, setTagId] = useState<string | null>(null);

    const handleProgram = async () => {
      if (!nfcSupported) {
        // Mock for desktop testing
        const mockId = 'MOCK_' + Math.random().toString(36).substr(2, 9);
        setTagId(mockId);
        return;
      }

      try {
        setIsProgramming(true);
        const reader = new (window as any).NDEFReader();
        await reader.scan();
        
        reader.onreading = async ({ serialNumber }: any) => {
          setTagId(serialNumber);
          setIsProgramming(false);
        };
      } catch (error) {
        setIsProgramming(false);
        alert("NFC Programming failed.");
      }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tagId) return;

      const newMember: Member = {
        id: tagId,
        ...formData,
        registeredAt: Date.now()
      };

      await set(ref(db, `members/${tagId}`), newMember);
      alert("Member registered successfully!");
      setFormData({ name: '', whatsapp: '', nic: '' });
      setTagId(null);
      setActiveTab('members');
    };

    return (
      <div className="max-w-2xl mx-auto">
        <Card className="p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Register New Member</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Full Name</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">WhatsApp Number</label>
                <input 
                  required
                  type="tel" 
                  value={formData.whatsapp}
                  onChange={e => setFormData({...formData, whatsapp: e.target.value})}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="077 123 4567"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">NIC Number</label>
                <input 
                  required
                  type="text" 
                  value={formData.nic}
                  onChange={e => setFormData({...formData, nic: e.target.value})}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="199012345678"
                />
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              {tagId ? (
                <div className="flex items-center justify-center gap-3 text-emerald-600 font-bold">
                  <CheckCircle2 />
                  Tag Linked: {tagId}
                  <button type="button" onClick={() => setTagId(null)} className="text-xs text-slate-400 underline ml-2">Change</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">To complete registration, you must link an NFC tag.</p>
                  <button 
                    type="button"
                    onClick={handleProgram}
                    disabled={isProgramming}
                    className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2 mx-auto"
                  >
                    <CreditCard size={18} />
                    {isProgramming ? 'Scanning Tag...' : 'Link NFC Tag'}
                  </button>
                </div>
              )}
            </div>

            <button 
              type="submit"
              disabled={!tagId}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              Complete Registration
            </button>
          </form>
        </Card>
      </div>
    );
  };

  const MembersView = () => {
    const [search, setSearch] = useState('');
    const filteredMembers = members.filter(m => 
      m.name.toLowerCase().includes(search.toLowerCase()) || 
      m.nic.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-900">Gym Members</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search members..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64"
            />
          </div>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Member</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">NIC</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">WhatsApp</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Joined</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Tag ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">No members found</td>
                  </tr>
                ) : (
                  filteredMembers.map(member => (
                    <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                            {member.name.charAt(0)}
                          </div>
                          <span className="font-semibold text-slate-900">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">{member.nic}</td>
                      <td className="px-6 py-4 text-slate-600 text-sm">{member.whatsapp}</td>
                      <td className="px-6 py-4 text-slate-600 text-sm">{format(member.registeredAt, 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-500 font-mono text-[10px]">{member.id}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  const SettingsView = () => {
    const [localSettings, setLocalSettings] = useState(settings);

    const handleSave = async () => {
      await set(ref(db, 'settings'), localSettings);
      alert("Settings saved!");
    };

    return (
      <div className="max-w-xl mx-auto">
        <Card className="p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Gym Settings</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Gym Name</label>
              <input 
                type="text" 
                value={localSettings.gymName}
                onChange={e => setLocalSettings({...localSettings, gymName: e.target.value})}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Charge per Minute (Rs.)</label>
              <input 
                type="number" 
                step="0.1"
                value={localSettings.chargePerMinute}
                onChange={e => setLocalSettings({...localSettings, chargePerMinute: parseFloat(e.target.value)})}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <button 
              onClick={handleSave}
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all"
            >
              Save Changes
            </button>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar / Navigation */}
      <aside className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 md:top-0 md:bottom-0 md:w-64 md:border-r md:border-t-0 p-4">
        <div className="hidden md:flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Users size={24} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">{settings.gymName}</h1>
        </div>

        <nav className="flex md:flex-col justify-around md:justify-start gap-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'attendance', icon: Wifi, label: 'Attendance' },
            { id: 'members', icon: Users, label: 'Members' },
            { id: 'register', icon: UserPlus, label: 'Register' },
            { id: 'settings', icon: SettingsIcon, label: 'Settings' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex flex-col md:flex-row items-center gap-3 p-3 rounded-xl transition-all group",
                activeTab === item.id 
                  ? "bg-indigo-50 text-indigo-600 font-bold" 
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              )}
            >
              <item.icon size={22} />
              <span className="text-[10px] md:text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="pb-24 md:pb-8 md:pl-72 p-6">
        <header className="flex items-center justify-between mb-8 md:hidden">
          <h1 className="text-xl font-black tracking-tight text-slate-900">{settings.gymName}</h1>
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
            <Users size={18} />
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'attendance' && <AttendanceView />}
            {activeTab === 'members' && <MembersView />}
            {activeTab === 'register' && <RegisterView />}
            {activeTab === 'settings' && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
