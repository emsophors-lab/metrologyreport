import React from 'react';
import { Layers, Users, MapPin, Hammer, Wrench, Factory, GraduationCap, Building } from 'lucide-react';
import { MetrologyReport, MetrologyUser } from '../types';

interface DashboardStatsProps {
  currentUser: MetrologyUser;
  reports: MetrologyReport[];
  allUsersCount?: number; // Only for admin
}

export default function DashboardStats({ currentUser, reports, allUsersCount }: DashboardStatsProps) {
  // Aggregate stats
  const totalInstrumentsCount = reports.length;
  
  const uniqueCustomers = new Set(reports.map(r => r.customer_name.trim().toLowerCase()));
  const totalCustomersCount = uniqueCustomers.size;

  const uniqueLocations = new Set(reports.map(r => r.customer_address.trim().toLowerCase()));
  const totalLocationsCount = uniqueLocations.size;

  const manufactureCount = reports.filter(r => r.service_type === 'Manufacture').length;
  const installationCount = reports.filter(r => r.service_type === 'Installation').length;
  const repairCount = reports.filter(r => r.service_type === 'Repair').length;

  const totalServices = manufactureCount + installationCount + repairCount;
  
  // Percentages
  const manufPct = totalServices > 0 ? Math.round((manufactureCount / totalServices) * 100) : 0;
  const installPct = totalServices > 0 ? Math.round((installationCount / totalServices) * 100) : 0;
  const repairPct = totalServices > 0 ? Math.round((repairCount / totalServices) * 100) : 0;

  // Render metric helper cards
  return (
    <div className="space-y-6">
      
      {/* 6.2 / 9.1 Core stats metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* Total instruments */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-slate-50 border border-[#C9D2E3] rounded-lg flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5 text-[#353C96]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">សេវាកម្មសរុប (Total)</p>
            <p className="text-xl font-bold text-slate-800 font-mono mt-0.5">{totalInstrumentsCount}</p>
          </div>
        </div>

        {/* Total customers */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">អតិថិជន (Customers)</p>
            <p className="text-xl font-bold text-slate-800 font-mono mt-0.5">{totalCustomersCount}</p>
          </div>
        </div>

        {/* Total locations */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-rose-50 border border-rose-100 rounded-lg flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-rose-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">ទីតាំង (Address)</p>
            <p className="text-xl font-bold text-slate-800 font-mono mt-0.5">{totalLocationsCount}</p>
          </div>
        </div>

        {/* Manufacture summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center shrink-0">
            <Factory className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">ផលិត (Manufactured)</p>
            <p className="text-xl font-bold text-emerald-800 font-mono mt-0.5">{manufactureCount}</p>
          </div>
        </div>

        {/* Installation summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
            <Wrench className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">តម្លើង (Installed)</p>
            <p className="text-xl font-bold text-blue-800 font-mono mt-0.5">{installationCount}</p>
          </div>
        </div>

        {/* Repair summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-center shrink-0">
            <Hammer className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">ជួសជុល (Repaired)</p>
            <p className="text-xl font-bold text-amber-800 font-mono mt-0.5">{repairCount}</p>
          </div>
        </div>
      </div>

      {/* Charts Grid - Section 6.3 - Beautiful pure React SVG Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Bar Chart count of service types */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
            លទ្ធផលសេវាកម្មមាត្រាសាស្ត្រតាមប្រភេទ (Bar Chart of Metrology Services)
          </h4>

          {totalServices === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
              មិនទាន់មានទិន្នន័យដើម្បីបង្ហាញតារាងក្រាហ្វិកឡើយ។
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Custom Bar Chart representing Manufactures */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold mb-1">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    ផលិតឧបករណ៍ឧបករណ៍មាត្រាសាស្ត្រ (Manufacture)
                  </span>
                  <span className="font-mono text-slate-800">{manufactureCount} ករណី</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-3 rounded-full transition-all duration-1000"
                    style={{ width: `${(manufactureCount / Math.max(totalServices, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Custom Bar Chart representing Installations */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold mb-1">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    តម្លើងឧបករណ៍វាស់វែង (Installation)
                  </span>
                  <span className="font-mono text-slate-800">{installationCount} ករណី</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-1000"
                    style={{ width: `${(installationCount / Math.max(totalServices, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Custom Bar Chart representing Repairs */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold mb-1">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    ជួសជុលឧបករណ៍មាត្រាសាស្ត្រ (Repair)
                  </span>
                  <span className="font-mono text-slate-800">{repairCount} ករណី</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-3 rounded-full transition-all duration-1000"
                    style={{ width: `${(repairCount / Math.max(totalServices, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Percentage Pie chart simulation via CSS Circular Donut Graph */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
              ភាគរយចំណែកសេវាកម្ម (Services Shares Ratio)
            </h4>

            {totalServices === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
                មិនទាន់មានទិន្នន័យដើម្បីបង្ហាញក្រាហ្វិកចំណែកឡើយ។
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                
                {/* SVG Visual Circle graph */}
                <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    {/* Background Circle */}
                    <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#f1f5f9" strokeWidth="3" />
                    
                    {/* Segment 1: Manufacture */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke="#10b981" // emerald-500
                      strokeWidth="3.2"
                      strokeDasharray={`${manufPct} ${100 - manufPct}`}
                      strokeDashoffset="0"
                    />

                    {/* Segment 2: Installation */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke="#3b82f6" // blue-500
                      strokeWidth="3.2"
                      strokeDasharray={`${installPct} ${100 - installPct}`}
                      strokeDashoffset={-manufPct}
                    />

                    {/* Segment 3: Repair */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke="#f59e0b" // amber-500
                      strokeWidth="3.2"
                      strokeDasharray={`${repairPct} ${100 - repairPct}`}
                      strokeDashoffset={-(manufPct + installPct)}
                    />
                  </svg>
                  <div className="absolute text-center">
                    <p className="text-lg font-black text-slate-800 font-mono">{totalServices}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">សរុបសេវាកម្ម</p>
                  </div>
                </div>

                {/* Legend panel */}
                <div className="space-y-2 text-xs w-full">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                      <span className="w-3.5 h-3.5 rounded bg-emerald-500 block shrink-0"></span>
                      ផលិត (Manufacture)
                    </span>
                    <span className="font-bold text-slate-800 font-mono">{manufPct}%</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                      <span className="w-3.5 h-3.5 rounded bg-blue-500 block shrink-0"></span>
                      តម្លើង (Installation)
                    </span>
                    <span className="font-bold text-slate-800 font-mono">{installPct}%</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                      <span className="w-3.5 h-3.5 rounded bg-amber-500 block shrink-0"></span>
                      ជួសជុល (Repair)
                    </span>
                    <span className="font-bold text-slate-800 font-mono">{repairPct}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <p className="text-[10px] text-slate-400 italic mt-4 text-center">
            ក្រាហ្វិកចំណែកទាំងនេះតំណាងឱ្យប្រតិបត្តិការរួមបញ្ចូលទាំងស្រុង តាមការកំណត់តម្រងបច្ចុប្បន្ន។
          </p>
        </div>
      </div>
    </div>
  );
}
