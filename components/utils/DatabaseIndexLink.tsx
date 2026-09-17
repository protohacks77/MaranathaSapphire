import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';

const DatabaseIndexLink: React.FC<{url?: string}> = ({url}) => {
    const {userProfile} = useAuth();
    if (!url || userProfile?.role !== Role.Admin || !url.startsWith('https://console.firebase.google.com/')) return null;
    return <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm text-sky-400 underline">Create Required Index</a>;
};
export default DatabaseIndexLink;
