import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Plus, Upload, Filter, Grid, List as ListIcon, 
  Settings, LogOut, Loader2, Sparkles, File as FileIcon,
  Video, Music, Lock, Mail, ArrowRight, User as UserIcon,
  CheckCircle, RefreshCw, KeyRound, AlertTriangle
} from 'lucide-react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  User,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  deleteUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { DriveFile, FilterState, AIAnalysis, FileType, UserProfile } from './types';
import { analyzeFileContent } from './services/gemini';
import { Modal, Button, Input } from './components/UI';
import { FileCard, FileViewer } from './components/FileComponents';

// --- Utility Functions for App ---
const getFileType = (mime: string, name: string): FileType => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return 'text';
  return 'other';
};

const groupFilesByDate = (files: DriveFile[]) => {
  const groups: { [key: string]: DriveFile[] } = {};
  
  files.forEach(file => {
    const date = new Date(file.uploadDate);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    let key = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
    
    if (date.toDateString() === today.toDateString()) key = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) key = 'Yesterday';
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(file);
  });

  return groups;
};

// --- Firestore Service ---
const syncUserToFirestore = async (user: User) => {
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userDocRef);

    if (!userSnapshot.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0],
        photoURL: user.photoURL,
        createdAt: Date.now(),
        lastLogin: Date.now()
      });
    } else {
      await updateDoc(userDocRef, {
        lastLogin: Date.now()
      });
    }
  } catch (error) {
    console.error("Error syncing user to Firestore:", error);
  }
};

const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
};

// --- Auth Component ---

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          await signOut(auth);
          setVerificationEmail(userCredential.user.email);
          return;
        }
        // Sync handled in App component
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // We sync basic info now, but strictly speaking verified status is simpler to check on login
        await sendEmailVerification(userCredential.user);
        await signOut(auth);
        setVerificationEmail(userCredential.user.email);
      }
    } catch (err: any) {
      console.error("Auth Error:", err.code, err.message);
      const errorCode = err.code;
      
      // Handle "Account already exists"
      if (errorCode === 'auth/email-already-in-use') {
        setError('User already exists. Sign in?');
      } 
      // Handle "Incorrect Credentials" (Login)
      else if (
        errorCode === 'auth/invalid-credential' || 
        errorCode === 'auth/user-not-found' || 
        errorCode === 'auth/wrong-password'
      ) {
        setError('Password or Email Incorrect');
      }
      // Handle Invalid Email
      else if (errorCode === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      }
      // Handle Weak Password (Registration)
      else if (errorCode === 'auth/weak-password') {
        setError('Password must be at least 6 characters.');
      }
      // Fallback
      else {
        setError(err.message || 'An error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailSent(true);
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code;
      if (errorCode === 'auth/user-not-found') {
        setError('No user found with this email.');
      } else if (errorCode === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Failed to send reset email. Try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // onAuthStateChanged in App component will handle the state update
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign in cancelled');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized in Firebase Console.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError('Popup closed or blocked.');
      } else {
        setError('Failed to sign in with Google. ' + (err.message || ''));
      }
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setVerificationEmail(null);
    setResetEmailSent(false);
    setIsResetMode(false);
    setIsLogin(true);
    setError('');
    setPassword('');
  };

  if (verificationEmail) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full mx-auto flex items-center justify-center mb-6">
            <Mail size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Verify your email</h2>
          <p className="text-gray-600 mb-8">
            We have sent you a verification email to <br />
            <span className="font-semibold text-gray-900">{verificationEmail}</span>.
            <br />
            Verify it and log in.
          </p>
          
          <button
            onClick={handleBackToLogin}
            className="w-full bg-gemini-600 hover:bg-gemini-700 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-gemini-200 transition-all"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  if (resetEmailSent) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full mx-auto flex items-center justify-center mb-6">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Check your email</h2>
          <p className="text-gray-600 mb-8">
            We sent you a password change link to <br />
            <span className="font-semibold text-gray-900">{email}</span>.
          </p>
          
          <button
            onClick={handleBackToLogin}
            className="w-full bg-gemini-600 hover:bg-gemini-700 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-gemini-200 transition-all"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (isResetMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-300">
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-gemini-50 text-gemini-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                <KeyRound size={28} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Reset Password</h2>
              <p className="text-gray-500 text-sm mt-1">Enter your email to receive a reset link</p>
            </div>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {error}
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500 outline-none transition-all"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gemini-600 hover:bg-gemini-700 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-gemini-200 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  'Get Reset Link'
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <button
                onClick={handleBackToLogin}
                className="text-gray-500 font-medium hover:text-gray-700 text-sm"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-gradient-to-r from-gemini-600 to-purple-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto flex items-center justify-center backdrop-blur-sm mb-4">
             <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Super Drive</h1>
          <p className="text-blue-100 text-sm">AI-Powered Intelligent Storage</p>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="flex-1">
                  {error === 'User already exists. Sign in?' ? (
                    <>
                      User already exists. <button type="button" onClick={() => { setIsLogin(true); setError(''); }} className="font-semibold underline hover:text-red-800">Sign in?</button>
                    </>
                  ) : error}
                </span>
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500 outline-none transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              {isLogin && (
                <div className="flex justify-end pt-1">
                  <button 
                    type="button"
                    onClick={() => { setIsResetMode(true); setError(''); }}
                    className="text-xs font-medium text-gemini-600 hover:text-gemini-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gemini-600 hover:bg-gemini-700 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-gemini-200 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'} <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full bg-white border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-gray-500 text-sm">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
              <button
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="ml-2 text-gemini-600 font-semibold hover:underline focus:outline-none"
              >
                {isLogin ? 'Sign Up' : 'Log In'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Profile Modal ---
interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onUpdate: (name: string, photoName: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, userProfile, onUpdate, onDelete }) => {
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [photoName, setPhotoName] = useState(userProfile?.photoName || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || '');
      setPhotoName(userProfile.photoName || '');
    }
  }, [userProfile]);

  const handleSubmit = async () => {
    setIsSaving(true);
    await onUpdate(displayName, photoName);
    setIsSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      await onDelete();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Profile">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-gemini-100 rounded-full flex items-center justify-center text-gemini-600 text-2xl font-bold">
            {userProfile?.photoURL ? (
               <img src={userProfile.photoURL} className="w-full h-full rounded-full object-cover" alt="Profile" />
            ) : (
               userProfile?.displayName?.charAt(0).toUpperCase() || userProfile?.email?.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{userProfile?.displayName || 'User'}</h3>
            <p className="text-sm text-gray-500">{userProfile?.email}</p>
            <p className="text-xs text-gray-400 mt-1">Member since {new Date(userProfile?.createdAt || 0).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <Input 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)} 
              placeholder="Enter your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Photo Name / URL</label>
             <Input 
              value={photoName} 
              onChange={(e) => setPhotoName(e.target.value)} 
              placeholder="Profile photo identifier"
            />
          </div>
        </div>

        <div className="pt-4 flex items-center justify-between border-t border-gray-100">
           <Button variant="danger" onClick={handleDelete} className="text-sm px-3">
             Delete Account
           </Button>
           <div className="flex gap-2">
             <Button variant="ghost" onClick={onClose}>Cancel</Button>
             <Button onClick={handleSubmit} disabled={isSaving}>
               {isSaving ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
             </Button>
           </div>
        </div>
      </div>
    </Modal>
  );
};


// --- Drive Dashboard Component ---

interface DriveDashboardProps {
  user: User;
}

const DriveDashboard: React.FC<DriveDashboardProps> = ({ user }) => {
  // State
  const [files, setFiles] = useState<DriveFile[]>(() => {
    // User-specific storage key
    const saved = localStorage.getItem(`gemini-drive-files-${user.uid}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [viewFile, setViewFile] = useState<DriveFile | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>({ search: '', type: 'all', dateRange: 'all' });
  const [isDragging, setIsDragging] = useState(false);

  // Profile State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Edit State
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Persist files
  useEffect(() => {
    localStorage.setItem(`gemini-drive-files-${user.uid}`, JSON.stringify(files));
  }, [files, user.uid]);

  // Fetch Profile
  useEffect(() => {
    const loadProfile = async () => {
      const profile = await getUserProfile(user.uid);
      if (profile) setUserProfile(profile);
    };
    loadProfile();
  }, [user.uid]);

  // Derived State
  const filteredFiles = useMemo(() => {
    let result = files;

    // Search
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(f => 
        f.name.toLowerCase().includes(q) || 
        f.notes.toLowerCase().includes(q) ||
        f.aiData?.summary.toLowerCase().includes(q) ||
        f.aiData?.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Type Filter
    if (filter.type !== 'all') {
      result = result.filter(f => f.type === filter.type);
    }

    // Date Sort (Implicitly Descending)
    return result.sort((a, b) => b.uploadDate - a.uploadDate);
  }, [files, filter]);

  const groupedFiles = groupFilesByDate(filteredFiles);

  // Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      prepareUpload(e.dataTransfer.files[0]);
    }
  };

  const prepareUpload = (file: File) => {
    setUploadFile(file);
    setUploadName(file.name);
    setUploadNotes('');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    setIsUploadModalOpen(true);
  };

  const handleConfirmUpload = async () => {
    if (!uploadFile || !uploadPreview) return;
    
    setIsUploading(true);
    
    const newFile: DriveFile = {
      id: crypto.randomUUID(),
      name: uploadName,
      type: getFileType(uploadFile.type, uploadName),
      mimeType: uploadFile.type,
      size: uploadFile.size,
      uploadDate: Date.now(),
      data: uploadPreview,
      notes: uploadNotes,
      aiData: {
        isAnalyzing: true,
        summary: '',
        tags: []
      }
    };

    setFiles(prev => [newFile, ...prev]);
    setIsUploadModalOpen(false);
    setIsUploading(false);

    // Trigger AI Analysis in background
    try {
      const aiResult = await analyzeFileContent(newFile);
      setFiles(prev => prev.map(f => 
        f.id === newFile.id 
          ? { ...f, aiData: { ...aiResult, isAnalyzing: false } } 
          : f
      ));
    } catch (err) {
      console.error("Analysis failed", err);
      setFiles(prev => prev.map(f => 
        f.id === newFile.id 
          ? { ...f, aiData: { isAnalyzing: false, summary: "Analysis failed", tags: [] } } 
          : f
      ));
    }
    
    // Reset upload state
    setUploadFile(null);
    setUploadPreview(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this file?')) {
      setFiles(prev => prev.filter(f => f.id !== id));
    }
  };

  const openEditModal = (e: React.MouseEvent, file: DriveFile) => {
    e.stopPropagation();
    setEditingFileId(file.id);
    setEditName(file.name);
    setEditNotes(file.notes);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingFileId) return;
    setFiles(prev => prev.map(f => 
      f.id === editingFileId 
        ? { ...f, name: editName, notes: editNotes }
        : f
    ));
    setIsEditModalOpen(false);
    setEditingFileId(null);
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  // Profile Handlers
  const handleUpdateProfile = async (name: string, photoName: string) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: name,
        photoName: photoName
      });
      // Optimistic update
      setUserProfile(prev => prev ? { ...prev, displayName: name, photoName } : null);
    } catch (e) {
      console.error("Failed to update profile", e);
      alert("Failed to update profile");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteUser(user);
    } catch (e) {
      console.error("Failed to delete account", e);
      alert("Failed to delete account. You may need to re-login to perform this action.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white sticky top-0 z-30 border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-gemini-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-gemini-200">
               <Sparkles size={20} className="fill-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600">
              Super Drive
            </h1>
          </div>
          
          <div className="flex-1 max-w-2xl relative group hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gemini-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Search files, contents, or AI tags..." 
              value={filter.search}
              onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-gemini-100 focus:border-gemini-500 transition-all outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsProfileModalOpen(true)}
                className="flex items-center gap-2 text-sm text-gray-700 mr-2 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
             >
                <div className="w-5 h-5 bg-gemini-200 rounded-full flex items-center justify-center text-xs font-bold text-gemini-700">
                  {userProfile?.displayName?.charAt(0) || user.email?.charAt(0)}
                </div>
                <span className="hidden sm:inline font-medium">{userProfile?.displayName || user.email?.split('@')[0]}</span>
             </button>
             <button onClick={handleSignOut} className="p-2 hover:bg-red-50 hover:text-red-600 rounded-full text-gray-500 transition-colors" title="Sign Out">
               <LogOut size={20} />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex flex-col">
        
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto no-scrollbar">
            <button 
              onClick={() => setFilter(prev => ({ ...prev, type: 'all' }))}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filter.type === 'all' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              All Files
            </button>
            <button 
              onClick={() => setFilter(prev => ({ ...prev, type: 'image' }))}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${filter.type === 'image' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Images
            </button>
            <button 
              onClick={() => setFilter(prev => ({ ...prev, type: 'video' }))}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${filter.type === 'video' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Video
            </button>
            <button 
              onClick={() => setFilter(prev => ({ ...prev, type: 'audio' }))}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${filter.type === 'audio' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Music
            </button>
            <button 
               onClick={() => setFilter(prev => ({ ...prev, type: 'text' }))}
               className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${filter.type === 'text' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Documents
            </button>
          </div>

          <Button onClick={() => document.getElementById('file-upload')?.click()}>
            <Plus size={18} /> New Upload
          </Button>
          <input 
            type="file" 
            id="file-upload" 
            className="hidden" 
            onChange={(e) => e.target.files?.[0] && prepareUpload(e.target.files[0])}
          />
        </div>

        {/* Drop Zone / Empty State */}
        {files.length === 0 && !filter.search ? (
           <div 
             className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl transition-colors ${isDragging ? 'border-gemini-500 bg-gemini-50' : 'border-gray-300 bg-white'}`}
             onDragOver={handleDragOver}
             onDragLeave={handleDragLeave}
             onDrop={handleDrop}
           >
             <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                <Upload size={32} className="text-gray-400" />
             </div>
             <h3 className="text-xl font-semibold text-gray-800 mb-2">Drop files here to upload</h3>
             <p className="text-gray-500 max-w-sm text-center mb-8">
               Support for Images, Video, Audio, PDFs, and Text files. Gemini AI will automatically tag and summarize them.
             </p>
             <Button onClick={() => document.getElementById('file-upload')?.click()} variant="secondary">
               Select Files
             </Button>
           </div>
        ) : (
          <div className="flex-1 overflow-y-auto pb-20" onDragOver={handleDragOver} onDrop={handleDrop}>
             {Object.keys(groupedFiles).length === 0 && (
                <div className="text-center py-20">
                  <p className="text-gray-500">No files found matching your filters.</p>
                </div>
             )}
             
             {Object.entries(groupedFiles).map(([dateLabel, groupFiles]) => (
               <div key={dateLabel} className="mb-8 animate-in slide-in-from-bottom-2 duration-500">
                 <h2 className="text-sm font-semibold text-gray-500 mb-4 sticky top-0 bg-gray-50 py-2 z-10 flex items-center gap-2">
                   {dateLabel} <span className="text-xs font-normal bg-gray-200 px-2 py-0.5 rounded-full text-gray-600">{groupFiles.length}</span>
                 </h2>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                   {groupFiles.map(file => (
                     <FileCard 
                       key={file.id} 
                       file={file} 
                       onClick={() => setViewFile(file)}
                       onDelete={(e) => handleDelete(e, file.id)}
                       onEdit={(e) => openEditModal(e, file)}
                     />
                   ))}
                 </div>
               </div>
             ))}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <Modal 
        isOpen={isUploadModalOpen} 
        onClose={() => !isUploading && setIsUploadModalOpen(false)}
        title="Upload File"
      >
        <div className="p-6 space-y-4">
          {/* File Preview */}
          <div className="w-full h-48 bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center relative border border-gray-200">
             {uploadPreview && uploadFile?.type.startsWith('image/') ? (
               <img src={uploadPreview} alt="Preview" className="w-full h-full object-contain" />
             ) : (
               <FileIcon className="text-gray-400 w-16 h-16" />
             )}
             <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
               {formatBytes(uploadFile?.size || 0)}
             </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File Name</label>
              <Input 
                value={uploadName} 
                onChange={(e) => setUploadName(e.target.value)} 
                placeholder="Enter file name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
              <textarea 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500 min-h-[100px] resize-none"
                placeholder="Add some details about this file..."
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gemini-600 bg-gemini-50 px-3 py-1.5 rounded-lg border border-gemini-100">
               <Sparkles size={16} />
               <span>AI Analysis enabled</span>
            </div>
            <div className="flex items-center gap-2">
               <Button variant="ghost" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading}>Cancel</Button>
               <Button onClick={handleConfirmUpload} disabled={isUploading}>
                 {isUploading ? (
                   <>
                     <Loader2 size={18} className="animate-spin" /> Uploading...
                   </>
                 ) : 'Upload'}
               </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit File Details"
      >
        <div className="p-6 space-y-4">
           <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File Name</label>
              <Input 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500 min-h-[100px] resize-none"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end pt-2 gap-2">
              <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </div>
        </div>
      </Modal>

      {/* Profile Modal */}
      <ProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userProfile={userProfile}
        onUpdate={handleUpdateProfile}
        onDelete={handleDeleteAccount}
      />

      {/* Full Screen Viewer */}
      {viewFile && (
        <FileViewer file={viewFile} onClose={() => setViewFile(null)} />
      )}

      {/* Drag Overlay */}
      {isDragging && !isUploadModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-gemini-500/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200"
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
           <Upload className="text-white w-20 h-20 mb-4 animate-bounce" />
           <h2 className="text-3xl font-bold text-white">Drop to Upload</h2>
        </div>
      )}
    </div>
  );
};

// --- Root App ---

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.emailVerified) {
          // Sync user to firestore whenever auth state confirms a verified user
          await syncUserToFirestore(currentUser);
        }
      }
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gemini-600 animate-spin" />
      </div>
    );
  }

  // Ensure user is verified before showing the dashboard
  if (!user || !user.emailVerified) {
    return <AuthScreen />;
  }

  return <DriveDashboard user={user} />;
};

// Helper for bytes
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default App;