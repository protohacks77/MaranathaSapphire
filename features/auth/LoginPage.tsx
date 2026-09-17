
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../services/firebase';
import { useNotification } from '../../context/NotificationContext';
import { UserProfile, Role } from '../../types';
import { Mail, Lock, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/utils/LoadingSpinner';

type LoginStatus = 'idle' | 'loading' | 'success';

const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginStatus, setLoginStatus] = useState<LoginStatus>('idle');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const { currentUser } = useAuth();

    useEffect(() => {
        if (currentUser) {
            navigate('/');
        }
    }, [currentUser, navigate]);

    const handleSearch = useCallback(async (queryStr: string) => {
        setSearchQuery(queryStr);
        if (queryStr.length < 2) {
            setSearchResults([]);
            return;
        }

        try {
            const usersRef = db.collection('users');
            const lowercasedQuery = queryStr.toLowerCase();
            
            // Name/Surname search
            const capitalizedQuery = queryStr.charAt(0).toUpperCase() + queryStr.slice(1);

            const nameQuery = usersRef.where('name', '>=', capitalizedQuery).where('name', '<=', capitalizedQuery + '\uf8ff').limit(3);
            const surnameQuery = usersRef.where('surname', '>=', capitalizedQuery).where('surname', '<=', capitalizedQuery + '\uf8ff').limit(3);
            
            // Role search
            const matchingRoles = Object.values(Role).filter(role => role.toLowerCase().includes(lowercasedQuery));
            const roleQueryPromises = matchingRoles.map(role => usersRef.where('role', '==', role).limit(5).get());

            const [nameSnapshot, surnameSnapshot, ...roleSnapshots] = await Promise.all([
                nameQuery.get(),
                surnameQuery.get(),
                ...roleQueryPromises,
            ]);
            
            const resultsMap = new Map<string, UserProfile>();
            
            nameSnapshot.docs.forEach(doc => {
                resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as UserProfile);
            });
            surnameSnapshot.docs.forEach(doc => {
                resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as UserProfile);
            });
            roleSnapshots.forEach(snapshot => {
                snapshot.docs.forEach(doc => {
                    resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as UserProfile);
                });
            });
            
            setSearchResults(Array.from(resultsMap.values()));

        } catch (error) {
            console.error("Error searching users:", error);
        }
    }, []);

    const handleSelectUser = (user: UserProfile) => {
        setSelectedUser(user);
        setEmail(user.email);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            addNotification('Please enter password.', 'warning');
            return;
        }

        setLoginStatus('loading');
        try {
            await auth.signInWithEmailAndPassword(email, password);
            setLoginStatus('success');
            addNotification('Login successful! Redirecting...', 'success');
            setTimeout(() => navigate('/'), 1000); // Allow time for notification
        } catch (error: any) {
            console.error(error);
            addNotification('Login failed. Please check your credentials.', 'error');
            setLoginStatus('idle');
        }
    };
    
    const getButtonText = () => {
        switch (loginStatus) {
            case 'loading': return 'Signing in...';
            case 'success': return 'Success!';
            default: return 'Sign in';
        }
    };

    // Check loading state of auth context as well
    const { loading: authLoading } = useAuth();
    if (loginStatus === 'loading' || authLoading) {
        return <LoadingSpinner fullScreen />;
    }

    return (
        <div className="relative min-h-screen flex items-center justify-center p-4 bg-slate-950 overflow-hidden">
            {/* Background image */}
            <div 
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/loginbg.jpg')" }}
            />
            {/* Dark overlay to ensure background is slightly darkened and content remains readable */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

            <div className="relative z-10 w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="mx-auto w-24 h-24 sm:w-28 sm:h-28 bg-white rounded-full flex items-center justify-center p-3 shadow-2xl ring-4 ring-white/10">
                        <img 
                            src="/maranathalogo.png" 
                            alt="MARANATHASAPPHIRE Logo" 
                            className="w-full h-full object-contain" 
                        />
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold text-white tracking-wide drop-shadow-md">
                        MARANATHASAPPHIRE
                    </h2>
                    <p className="mt-2 text-sm text-gray-300 drop-shadow">
                        Sign in to your account
                    </p>
                </div>
                <div className="bg-[#161B22]/95 backdrop-blur-md shadow-2xl rounded-2xl p-8 space-y-8 border border-gray-700">
                    {/* User Search Login */}
                    {!selectedUser && (
                        <div className="relative">
                            <label htmlFor="search" className="sr-only">Search for user</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="search"
                                    name="search"
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder="Search your name or role to begin..."
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-md leading-5 bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                />
                            </div>
                            {searchResults.length > 0 && (
                                <ul className="absolute z-10 w-full bg-gray-800 border border-gray-600 rounded-md mt-1 shadow-lg max-h-60 overflow-auto">
                                    {searchResults.map(user => (
                                        <li key={user.id} onClick={() => handleSelectUser(user)} className="cursor-pointer select-none relative py-2 px-4 text-white hover:bg-sky-700">
                                            <span className="font-normal block truncate">{user.name} {user.surname}</span>
                                            <span className="text-gray-400 text-xs block">{user.role} - {user.department}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {selectedUser && (
                         <div className="border border-gray-700 rounded-lg p-4 flex justify-between items-center bg-gray-800/50">
                            <div>
                                <p className="font-semibold text-gray-200">{selectedUser.name} {selectedUser.surname}</p>
                                <p className="text-sm text-gray-400">{selectedUser.email}</p>
                            </div>
                            <button onClick={() => {setSelectedUser(null); setEmail(''); setPassword('');}} className="text-sm text-sky-500 hover:underline">Change</button>
                        </div>
                    )}

                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-700"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-[#161B22] text-gray-400">
                          {selectedUser ? 'Enter Password' : 'Or sign in manually'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Manual Login Form */}
                    <form className="space-y-6" onSubmit={handleLogin}>
                        {!selectedUser && (
                           <div className="relative">
                               <label htmlFor="email-address" className="sr-only">Email address</label>
                               <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                               <input id="email-address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                   className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm"
                                   placeholder="Email address" />
                           </div>
                        )}
                        <div className="relative">
                            <label htmlFor="password" className="sr-only">Password</label>
                             <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                            <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
                                className="appearance-none rounded-md relative block w-full px-3 py-3 pl-10 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm"
                                placeholder="Password" />
                        </div>
                        <div>
                            <button type="submit" disabled={loginStatus !== 'idle'}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-sky-800 disabled:cursor-not-allowed">
                                {getButtonText()}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
