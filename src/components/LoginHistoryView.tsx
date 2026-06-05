import React, { useEffect, useState } from 'react';
import { 
  Clock, 
  Search, 
  RotateCcw, 
  ShieldCheck, 
  Activity, 
  Filter, 
  Database, 
  UserCheck, 
  Laptop, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle 
} from 'lucide-react';
import { LoginHistory } from '../types';
import { fetchLoginHistory } from '../services/loginHistoryService';

export default function LoginHistoryView() {
  const [history, setHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const loadHistoryData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await fetchLoginHistory();
      setHistory(data);
    } catch (err: any) {
      console.error('Failed to retrieve login history logs:', err);
      setErrorMsg('បរាជ័យក្នុងការទាញយកទិន្នន័យប្រវត្តិចូលប្រព័ន្ធ / Failed to load login logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistoryData();
  }, []);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedRole('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  // Internal Filtering Logic
  const filteredHistory = history.filter(item => {
    // 1. Full text query search
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || 
      (item.user_email && item.user_email.toLowerCase().includes(query)) ||
      (item.company_name && item.company_name.toLowerCase().includes(query)) ||
      (item.user_role && item.user_role.toLowerCase().includes(query)) ||
      (item.ip_address && item.ip_address.toLowerCase().includes(query)) ||
      (item.device_info && item.device_info.toLowerCase().includes(query));

    // 2. Role filter match
    const matchesRole = selectedRole === 'all' || item.user_role === selectedRole;

    // 3. Date-range filter matches
    const recordDateStr = item.login_at ? item.login_at.split('T')[0] : '';
    const matchesStart = !startDate || recordDateStr >= startDate;
    const matchesEnd = !endDate || recordDateStr <= endDate;

    return matchesSearch && matchesRole && matchesStart && matchesEnd;
  });

  // Calculate statistics for the summary badges
  const totalLoginsCount = filteredHistory.length;
  const successfulLogins = filteredHistory.filter(i => i.login_status === 'success').length;
  const uniqueUsersCount = new Set(filteredHistory.map(i => i.user_id)).size;

  // Pagination bounds
  const totalPagesCount = Math.ceil(filteredHistory.length / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedItems = filteredHistory.slice(indexOfFirstItem, indexOfLastItem);

  // Function to translate and format Date
  const formatKhmerDateTime = (isoString: string) => {
    if (!isoString) return '-';
    try {
      const dt = new Date(isoString);
      if (isNaN(dt.getTime())) return isoString;

      const day = String(dt.getDate()).padStart(2, '0');
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const year = dt.getFullYear();

      const hours = String(dt.getHours()).padStart(2, '0');
      const minutes = String(dt.getMinutes()).padStart(2, '0');
      const seconds = String(dt.getSeconds()).padStart(2, '0');

      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
      return isoString;
    }
  };

  // Get human friendly role badge style
  const getRoleLabelAndStyle = (role: string) => {
    switch (role) {
      case 'superadmin':
        return {
          label: 'Super Admin',
          classes: 'bg-rose-50 border-rose-200 text-rose-700'
        };
      case 'admin':
        return {
          label: 'Admin',
          classes: 'bg-indigo-50 border-indigo-200 text-indigo-700'
        };
      case 'company':
        return {
          label: 'Company',
          classes: 'bg-emerald-50 border-emerald-200 text-emerald-700'
        };
      default:
        return {
          label: role || 'Unknown',
          classes: 'bg-slate-50 border-slate-200 text-slate-700'
        };
    }
  };

  // Detect browser/Platform from User Agent string
  const getCleanDeviceInfo = (item: LoginHistory) => {
    const ua = item.user_agent || '';
    let browser = 'Other Browser';
    if (ua.includes('Chrome')) browser = 'Google Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Apple Safari';
    else if (ua.includes('Firefox')) browser = 'Mozilla Firefox';
    else if (ua.includes('Edg')) browser = 'Microsoft Edge';

    let os = 'OS';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';

    return {
      browser,
      os,
      raw: item.device_info || 'Local platform'
    };
  };

  return (
    <div className="space-y-6" id="login-history-view-container">
      
      {/* Title Header with descriptive details */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-100 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-navy text-gold rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-navy/10 border border-gold/15">
            <Clock className="h-6 w-6 text-gold animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 font-muol leading-loose">
              ប្រវត្តិចូលប្រើប្រាស់ប្រព័ន្ធ
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              ពិនិត្យមើល និងតាមដានរាល់សកម្មភាពចូលគណនីគ្រប់គ្រងរបស់សហគ្រាស និងមន្ត្រីជំនាញ (Account Access Trail)
            </p>
          </div>
        </div>

        {/* Action Button - Refresh logs */}
        <button
          type="button"
          onClick={loadHistoryData}
          className="px-4 py-2 bg-slate-900 text-gold font-bold text-xs rounded-lg shadow-xs hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>ទាញយកឡើងវិញ (Refresh Logs)</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-100 py-16 text-center shadow-xs flex flex-col items-center justify-center gap-3">
          <div className="h-9 w-9 border-3 border-gold border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-semibold font-sans font-muol">កំពុងទាញយកប្រវត្តិចូលប្រើប្រាស់ពី Supabase Cloud...</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-red-50 border border-red-150 rounded-xl p-5 text-center text-xs text-red-700 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="font-bold leading-relaxed">{errorMsg}</p>
          <button
            type="button"
            onClick={loadHistoryData}
            className="mt-2 text-xs font-bold bg-white border border-red-200 px-4 py-1.5 rounded-lg text-red-800 shadow-xs hover:bg-red-100 active:scale-95 transition-all"
          >
            ព្យាយាមឡើងវិញ / Retry Table Fetch
          </button>
        </div>
      ) : (
        <>
          {/* Quick Stats Grid Summary Banner Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Stat Item 1: Total Logins */}
            <div className="bg-white rounded-xl border border-slate-100 p-4.5 flex items-center justify-between shadow-xs">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ការចូលប្រើប្រាស់សរុប</p>
                <p className="text-2xl font-black font-mono text-slate-800 leading-none">{totalLoginsCount}</p>
                <p className="text-[9px] text-slate-400 font-medium font-sans">ទិន្នន័យស្របតាមជម្រើសចម្រោះ</p>
              </div>
              <div className="h-11 w-11 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-500 shrink-0 border border-indigo-100">
                <Activity className="h-5.5 w-5.5" />
              </div>
            </div>

            {/* Stat Item 2: Success logins status count */}
            <div className="bg-white rounded-xl border border-slate-100 p-4.5 flex items-center justify-between shadow-xs">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ចូលបានជោគជ័យ (Success)</p>
                <p className="text-2xl font-black font-mono text-emerald-600 leading-none">{successfulLogins}</p>
                <p className="text-[9px] text-slate-400 font-medium font-sans">100% Secure Sessions</p>
              </div>
              <div className="h-11 w-11 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 shrink-0 border border-emerald-100">
                <ShieldCheck className="h-5.5 w-5.5" />
              </div>
            </div>

            {/* Stat Item 3: Unique active user identities */}
            <div className="bg-white rounded-xl border border-slate-100 p-4.5 flex items-center justify-between shadow-xs">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">សហគ្រាស/មន្ត្រីផ្សេងគ្នា</p>
                <p className="text-2xl font-black font-mono text-indigo-600 leading-none">{uniqueUsersCount}</p>
                <p className="text-[9px] text-slate-400 font-medium font-sans">គណនី active ក្នុងបញ្ជីឡុក</p>
              </div>
              <div className="h-11 w-11 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 shrink-0 border border-amber-100">
                <UserCheck className="h-5.5 w-5.5" />
              </div>
            </div>

          </div>

          {/* Interactive filter controls toolbar */}
          <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Filter className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-700 font-muol">ស្វែងរកលម្អិត និងចម្រោះលទ្ធផល (Log Query Controls)</h3>
            </div>

            {/* Layout rules: desktop is single line, mobile stacked vertically */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Search text input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 font-muol">ស្វែងរកពាក្យគន្លឹះ / Search Query</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold focus:bg-white"
                    placeholder="ស្វែងរកអ៊ីម៉ែល សហគ្រាស..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>

              {/* Role filter dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 font-muol">ចម្រោះតាមតួនាទី / Role Filter</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold focus:bg-white"
                  value={selectedRole}
                  onChange={(e) => {
                    setSelectedRole(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">គ្រប់គ្រងតួនាទីទាំងអស់ (All Roles)</option>
                  <option value="superadmin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="company">Company</option>
                </select>
              </div>

              {/* Start Date input picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 font-muol">ចាប់ពីថ្ងៃទី / Start Date</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold focus:bg-white"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              {/* End Date input picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 font-muol">រហូតដល់ថ្ងៃទី / End Date</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold focus:bg-white"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  {/* Reset Filters button */}
                  {(searchQuery || selectedRole !== 'all' || startDate || endDate) && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      title="សម្អាតហ្វីលទ័រ (Clear all)"
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-navy rounded-lg transition-all"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* History record data list table */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" id="login-history-table-wrapper">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-4 text-center w-12 select-none">ល.រ</th>
                    <th className="p-4">កាលបរិច្ឆេទ & ម៉ោង (Date & Time)</th>
                    <th className="p-4">គណនី / អ៊ីមែល (User / Email)</th>
                    <th className="p-4">តួនាទី (Role)</th>
                    <th className="p-4">ឈ្មោះសហគ្រាស (Company Enterprise)</th>
                    <th className="p-4">អាសយដ្ឋាន IP (IP Address)</th>
                    <th className="p-4">កម្មវិធីរុករក/ឧបករណ៍ (Client Browser & Platform)</th>
                    <th className="p-4 text-center">ស្ថានភាព</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                  {paginatedItems.map((item, idx) => {
                    const rowNumber = indexOfFirstItem + idx + 1;
                    const roleCfg = getRoleLabelAndStyle(item.user_role);
                    const cleanDevice = getCleanDeviceInfo(item);

                    return (
                      <tr 
                        key={item.id || idx} 
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Number order column */}
                        <td className="p-4 text-center font-mono font-bold text-slate-400 select-none">
                          {rowNumber}
                        </td>

                        {/* Login date column */}
                        <td className="p-4 font-mono font-bold text-slate-600 whitespace-nowrap">
                          {formatKhmerDateTime(item.login_at)}
                        </td>

                        {/* Account email/username column */}
                        <td className="p-4">
                          <p className="font-bold text-slate-800">{item.user_email}</p>
                          <p className="text-[10px] text-slate-400 font-mono font-medium">ID: {item.user_id}</p>
                        </td>

                        {/* Role selection label */}
                        <td className="p-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-[9.5px] font-black uppercase rounded-md border tracking-wider ${roleCfg.classes}`}>
                            {roleCfg.label}
                          </span>
                        </td>

                        {/* Enterprise context name */}
                        <td className="p-4 max-w-[200px]">
                          <p className="font-sans text-[11.5px] text-slate-700 leading-relaxed font-semibold">
                            {item.company_name}
                          </p>
                          <p className="text-[9.5px] text-slate-400 font-mono font-semibold">
                            ID: {item.company_id || 'N/A'}
                          </p>
                        </td>

                        {/* Access IP address column */}
                        <td className="p-4 font-mono text-[11px] font-bold text-sky-850 whitespace-nowrap">
                          {item.ip_address || '127.0.0.1'}
                        </td>

                        {/* Client device system info */}
                        <td className="p-4 max-w-[220px]">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Laptop className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-[11px]">
                              {cleanDevice.browser} ({cleanDevice.os})
                            </span>
                          </div>
                          <p className="text-[8.5px] text-slate-400 font-mono truncate hover:text-clip hover:whitespace-normal transition-all" title={item.user_agent}>
                            {item.user_agent}
                          </p>
                        </td>

                        {/* Login operation status column */}
                        <td className="p-4 text-center whitespace-nowrap">
                          {item.login_status === 'success' ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-150/30 text-emerald-800 border border-emerald-500/20 uppercase tracking-widest">
                              SUCCESS
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-widest">
                              FAILED
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Database className="h-10 w-10 text-slate-200" />
                          <p className="font-bold text-slate-600 text-xs">មិនទាន់មានទិន្នន័យសម្រាប់រយៈពេលនេះ</p>
                          <p className="text-[10px] text-slate-400">No company service data for this period.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer bar */}
            {totalPagesCount > 1 && (
              <div className="bg-slate-50 border-t border-slate-100 p-4 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">
                  បង្ហាញពី <span className="font-bold text-slate-700">{indexOfFirstItem + 1}</span> ដល់ <span className="font-bold text-slate-700">{Math.min(indexOfLastItem, filteredHistory.length)}</span> នៃ <span className="font-bold text-slate-700">{filteredHistory.length}</span> កំណត់ត្រា
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-55 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {Array.from({ length: totalPagesCount }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`h-7 w-7 text-xs font-bold font-mono rounded-md border transition-all ${
                        currentPage === pageNum 
                          ? 'bg-navy border-navy text-gold' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={currentPage === totalPagesCount}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPagesCount))}
                    className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-55 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
