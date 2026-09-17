import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import firebase from 'firebase/compat/app';
import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../services/firebase';
import { Patient } from '../../types';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { Search, FileText, User, Calendar, Hash, Bed, LayoutGrid, Table as TableIcon, Filter, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotification } from '../../context/NotificationContext';

const PatientManagement: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // New State for View Mode and Filters
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { addNotification } = useNotification();

  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearchTerm(searchQuery.trim().toLowerCase()), 300); return () => clearTimeout(timer); }, [searchQuery]);
  const patientQuery = useMemo(() => {
      let query: firebase.firestore.Query = db.collection('patients');
      if (searchTerm.length >= 2) query = query.where('searchPrefixes', 'array-contains', searchTerm);
      if (statusFilter) query = query.where('status', '==', statusFilter);
      if (minAge || maxAge) query = query.where('age', '>=', Number(minAge || 0)).where('age', '<=', Number(maxAge || 999)).orderBy('age');
      return query.orderBy('surname');
  }, [searchTerm, statusFilter, minAge, maxAge]);
  const { records: patients, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh } = usePagedQuery<Patient>(patientQuery, `patients:${searchTerm}:${statusFilter}:${minAge}:${maxAge}`);

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
        const lowercasedQuery = searchQuery.toLowerCase();
        
        // Name/ID Filter
        const matchesSearch = true; // Search was applied before pagination.

        // Age Range Filter
        const pAge = p.age;
        const min = minAge ? parseInt(minAge) : 0;
        const max = maxAge ? parseInt(maxAge) : 999;
        const matchesAge = pAge >= min && pAge <= max;

        // Status Filter
        const matchesStatus = statusFilter ? p.status === statusFilter : true;

        return matchesSearch && matchesAge && matchesStatus;
    });
  }, [searchQuery, minAge, maxAge, statusFilter, patients]);

  if (loading && !patients.length) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-white">Patient Management</h1>
            <p className="text-gray-400 text-sm mt-1">Manage and view all registered patients</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Global Search */}
            <div className="relative flex-grow md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Search name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-[#161B22] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all"
                />
            </div>

            {/* View Toggle */}
            <div className="flex bg-[#161B22] border border-gray-700 rounded-lg p-1">
                <button 
                    onClick={() => setViewMode('cards')}
                    className={`p-2 rounded-md transition-all ${viewMode === 'cards' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="Card View"
                >
                    <LayoutGrid size={18} />
                </button>
                <button 
                    onClick={() => setViewMode('table')}
                    className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="Table View"
                >
                    <TableIcon size={18} />
                </button>
            </div>
        </div>
      </div>

      {/* Extended Filters - Only visible in Table Mode */}
      {viewMode === 'table' && (
          <div className="bg-[#161B22] border border-gray-700 rounded-lg p-4 animate-slide-in-top">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-sky-400">
                  <Filter size={16} />
                  <span>Advanced Filters</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Age Range</label>
                      <div className="flex gap-2">
                        <input 
                            type="number" 
                            placeholder="Min"
                            value={minAge} 
                            onChange={(e) => setMinAge(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm text-white focus:outline-none focus:border-sky-500"
                        />
                        <span className="text-gray-500 self-center">-</span>
                        <input 
                            type="number" 
                            placeholder="Max"
                            value={maxAge} 
                            onChange={(e) => setMaxAge(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                  </div>
                  <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Filter by Status</label>
                      <select 
                          value={statusFilter} 
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm text-white focus:outline-none focus:border-sky-500"
                      >
                          <option value="">All Statuses</option>
                          <option value="Admitted">Admitted</option>
                          <option value="PendingDischarge">Pending Discharge</option>
                          <option value="Discharged">Discharged</option>
                      </select>
                  </div>
                  <div className="flex items-end">
                      <button 
                        onClick={() => { setMinAge(''); setMaxAge(''); setStatusFilter(''); setSearchQuery(''); }}
                        className="px-4 py-2 text-sm bg-gray-700 text-gray-300 hover:text-white rounded-md hover:bg-gray-600 transition-colors w-full"
                      >
                          Clear Filters
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Content Area */}
      {viewMode === 'cards' ? (
          // CARD VIEW
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map(patient => (
              <div key={patient.id} className="bg-[#161B22] border border-gray-700 rounded-xl shadow-sm flex flex-col justify-between p-6 hover:border-sky-500/50 transition-all group">
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition-colors">{patient.name} {patient.surname}</h3>
                      <p className="text-gray-400 text-sm">{patient.gender}, {patient.age} years</p>
                    </div>
                    <span className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wide rounded-full ${
                      patient.status === 'Admitted' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                      patient.status === 'PendingDischarge' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' :
                      'bg-gray-800 text-gray-400 border border-gray-700'
                    }`}>
                      {patient.status === 'PendingDischarge' ? 'Pending' : patient.status}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                     <div className="flex items-center p-2 bg-gray-800/50 rounded-lg">
                        <Hash size={16} className="text-gray-500 mr-3" />
                        <span className="text-sm text-gray-300 font-mono">{patient.hospitalNumber}</span>
                     </div>
                     <div className="flex items-center p-2 bg-gray-800/50 rounded-lg">
                        <Calendar size={16} className="text-gray-500 mr-3" />
                        <span className="text-sm text-gray-300">{patient.dateOfBirth}</span>
                     </div>
                     {patient.status === 'Admitted' && patient.currentWardName && (
                        <div className="flex items-center p-2 bg-blue-900/20 border border-blue-900/30 rounded-lg">
                            <Bed size={16} className="text-blue-400 mr-3" />
                            <span className="text-sm text-blue-200 font-medium">{patient.currentWardName} <span className="text-blue-400 mx-1">•</span> Bed {patient.currentBedNumber}</span>
                        </div>
                     )}
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-700">
                  <Link to={`/patients/${patient.id}`} className="flex items-center justify-center w-full gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 transition-colors shadow-lg shadow-sky-900/20">
                    <FileText size={16} />
                    View Profile
                  </Link>
                </div>
              </div>
            ))}
          </div>
      ) : (
          // TABLE VIEW
          <div className="bg-[#161B22] border border-gray-700 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-700">
                          <tr>
                              <th className="px-6 py-4 font-medium">Hospital No</th>
                              <th className="px-6 py-4 font-medium">Full Name</th>
                              <th className="px-6 py-4 font-medium">Gender</th>
                              <th className="px-6 py-4 font-medium">Age</th>
                              <th className="px-6 py-4 font-medium">Status</th>
                              <th className="px-6 py-4 font-medium text-right">Action</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                          {filteredPatients.map((patient) => (
                              <tr key={patient.id} className="hover:bg-gray-800/30 transition-colors group">
                                  <td className="px-6 py-4 font-mono text-sky-400 font-medium">
                                      {patient.hospitalNumber}
                                  </td>
                                  <td className="px-6 py-4 font-medium text-white">
                                      {patient.name} {patient.surname}
                                  </td>
                                  <td className="px-6 py-4 text-gray-400">
                                      {patient.gender}
                                  </td>
                                  <td className="px-6 py-4 text-gray-300">
                                      {patient.age}
                                  </td>
                                  <td className="px-6 py-4">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                          patient.status === 'Admitted' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                                          patient.status === 'PendingDischarge' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' :
                                          'bg-gray-800 text-gray-400 border border-gray-700'
                                      }`}>
                                          {patient.status === 'PendingDischarge' ? 'Pending' : patient.status}
                                      </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <Link 
                                          to={`/patients/${patient.id}`} 
                                          className="inline-flex items-center gap-1 text-sm font-medium text-sky-500 hover:text-sky-400 hover:underline"
                                      >
                                          View Profile
                                      </Link>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
              {filteredPatients.length === 0 && (
                  <div className="text-center py-12">
                      <p className="text-gray-500">No patients found matching your criteria.</p>
                  </div>
              )}
          </div>
      )}

       {filteredPatients.length === 0 && viewMode === 'cards' && (
          <div className="text-center py-12 bg-[#161B22] border border-gray-700 rounded-lg col-span-full">
            <p className="text-gray-400">No patients found matching your search.</p>
          </div>
        )}
      <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={refresh} />
    </div>
  );
};

export default PatientManagement;
