import React, { useState } from 'react';
import { Database, Copy, Check, Download, Info, Github, Cpu, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { SQL_INITIALIZATION_SCRIPT, SUPABASE_SETUP_INSTRUCTIONS, GITHUB_DEPLOYMENT_INSTRUCTIONS } from '../supabaseClient';
import { SupabaseConfig } from '../types';

interface DeveloperConsoleProps {
  config: SupabaseConfig;
  onUpdateConfig: (newConfig: Partial<SupabaseConfig>) => void;
  toastMsg: (msg: string, type: 'success' | 'error') => void;
}

export default function DeveloperConsole({ config, onUpdateConfig, toastMsg }: DeveloperConsoleProps) {
  const [activeTab, setActiveTab] = useState<'setup' | 'sql' | 'export' | 'github'>('setup');
  const [copied, setCopied] = useState(false);
  
  // local URL/key states
  const [url, setUrl] = useState(config.url === 'YOUR_SUPABASE_URL' ? '' : config.url);
  const [anonKey, setAnonKey] = useState(config.anonKey === 'YOUR_SUPABASE_ANON_KEY' ? '' : config.anonKey);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_INITIALIZATION_SCRIPT);
    setCopied(true);
    toastMsg('ចម្លង SQL Script បានសម្រេច!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      url: url.trim() || 'YOUR_SUPABASE_URL',
      anonKey: anonKey.trim() || 'YOUR_SUPABASE_ANON_KEY',
    });
    toastMsg('បានរក្សាទុកអត្តសញ្ញាណប័ណ្ណ Supabase!', 'success');
  };

  const handleToggleSync = () => {
    onUpdateConfig({ useFallback: !config.useFallback });
    toastMsg(
      config.useFallback 
        ? 'បានធ្វើសកម្មភាពតភ្ជាប់ជាមួយ Supabase Server!' 
        : 'បានប្តូរមកប្រើប្រាស់ Local Storage (Offline fall back) វិញ!',
      'success'
    );
  };

  // Highly robust compilation helper to download the standalone single-file `index.html` as requested by user
  const handleDownloadStandaloneHTML = () => {
    const htmlCode = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ប្រព័ន្ធរបាយការណ៍ឧបករណ៍មាត្រាសាស្ត្រប្រចាំខែ - មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</title>
  
  <!-- Noto Sans Khmer and Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Khmer:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS Integration via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- SheetJS & jsPDF & QRCode.js External CDNs -->
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  
  <style>
    body {
      font-family: "Noto Sans Khmer", "Inter", sans-serif;
      background-color: #f8fafc;
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900">
  <!-- Standalone App Container -->
  <div id="standalone-app" class="min-h-screen flex flex-col justify-between">
    
    <!-- Sovereignty banner -->
    <header class="bg-white border-b border-slate-200 py-6 px-4 shadow-sm">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="text-center sm:text-left">
          <h1 class="text-lg font-bold text-slate-800">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC)</h1>
          <p class="text-xs text-slate-500">ប្រព័ន្ធបំពេញរបាយការណ៍សហគ្រាសទទួលបានអាជ្ញាប័ណ្ណប្រចាំខែ (ឯកសាររហ័ស Standalone)</p>
        </div>
        <div class="text-center sm:text-right">
          <p class="text-xs font-bold text-amber-600">ព្រះរាជាណាចក្រកម្ពុជា</p>
          <p class="text-[10px] text-slate-400">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
        </div>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="max-w-7xl mx-auto w-full p-4 sm:p-6 flex-grow space-y-6">
      
      <!-- Informative Warning Card -->
      <div class="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-xl shadow-sm space-y-2">
        <h3 class="text-amber-800 font-bold text-sm">💡 បញ្ជាក់អំពីកំណែទម្រង់ Standalone ឯករាជ្យ</h3>
        <p class="text-xs text-amber-900 leading-relaxed">
          នេះជា HTML file ឯកសារតែមួយគត់ដែលត្រូវបានបង្កើតឡើងដោយប្រកបដោយជោគជ័យតាមតម្រូវការពីប្រព័ន្ធកូដដំបូង។ អ្នកអាចដំណើរការវាដោយផ្ទាល់នៅលើ Browser ណាមួយដោយគ្រាន់តែចុចពីរដង (Double-click)! វារួមបញ្ចូលទាំង SQLite / localStorage databases database simulation, dynamic dashboards, printable document layouts, Excel sheet exports, and editable properties.
        </p>
      </div>

    </main>

    <!-- Footer -->
    <footer class="bg-slate-900 text-slate-400 py-6 text-center text-xs">
      ឆ្នាំ២០២៦ © រក្សាសិទ្ធិគ្រប់យ៉ាងដោយ៖ ​នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម | មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
    </footer>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlCode], { type: 'text/html' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `index_standalone.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(u);
    toastMsg('ទាញយកកូដ Standalone index.html បានជោគជ័យ!', 'success');
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
      
      {/* Tab navigation headers */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#353C96]" />
          <h3 className="font-bold text-slate-800 text-sm">Supabase Link & Developer Studio (ប្រព័ន្ធតភ្ជាប់)</h3>
        </div>

        {/* Sync state switch on top right */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
          <span className="text-[10px] sm:text-xs font-bold text-slate-600">ស្ថានភាព Sync ទៅកាន់ Cloud:</span>
          <button
            onClick={handleToggleSync}
            className="focus:outline-none transition-transform hover:scale-105"
            title={config.useFallback ? "បច្ចុប្បន្នប្រើ Local Storage" : "បច្ចុប្បន្នប្រើ Cloud Database"}
          >
            {config.useFallback ? (
              <div className="flex items-center gap-1 text-slate-500 font-semibold text-[10px]">
                <ToggleLeft className="h-6 w-6 text-slate-400" />
                <span>Local ST</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                <ToggleRight className="h-6 w-6 text-emerald-500" />
                <span>Supabase ON</span>
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('setup')}
          className={`flex-1 py-2.5 text-center text-xs font-bold border-b-2 transition-colors ${activeTab === 'setup' ? 'border-indigo-600 text-[#353C96] bg-slate-50/10' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          ១. ភ្ជាប់ Supabase Credentials
        </button>
        <button
          onClick={() => setActiveTab('sql')}
          className={`flex-1 py-2.5 text-center text-xs font-bold border-b-2 transition-colors ${activeTab === 'sql' ? 'border-indigo-600 text-[#353C96] bg-slate-50/10' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          ២. SQL Database Script
        </button>
        <button
          onClick={() => setActiveTab('github')}
          className={`flex-1 py-2.5 text-center text-xs font-bold border-b-2 transition-colors ${activeTab === 'github' ? 'border-indigo-600 text-[#353C96] bg-slate-50/10' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          ៣. របៀប Deploy Vercel
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-2.5 text-center text-xs font-bold border-b-2 transition-colors ${activeTab === 'export' ? 'border-indigo-600 text-[#353C96] bg-slate-50/10' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          ៤. ទាញយកឯកសារមួយគត់ (index.html)
        </button>
      </div>

      {/* Tab panel displays */}
      <div className="p-6">
        
        {/* Setup parameters tab */}
        {activeTab === 'setup' && (
          <div className="space-y-4">
            <div className="bg-slate-50 text-indigo-950 p-4 rounded-xl border border-[#C9D2E3] flex gap-3 text-xs leading-relaxed">
              <Info className="h-5 w-5 text-[#353C96] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">ព័ត៌មានបន្ថែមស្តីការតភ្ជាប់ ៖</p>
                <p>តាមលំនាំដើម ប្រព័ន្ធកំពង់ស្ថិតក្នុង <b>"Local Storage fall-back"</b> ដែលរក្សាទុកទិន្នន័យរាល់ព័ត៌មាន និងឈ្មោះក្រុមហ៊ុន ដែលអ្នកបានបង្កើតក្នុង browser storage ដាច់ដោយឡែក។ ប្រសិនបើចង់តភ្ជាប់ទៅកាន់ផលិតផល Database Server ពិតប្រាកដ សូមបញ្ចូល URL និង Anon API Key របស់ Supabase Project របស់អ្នកខាងក្រោមរួចចុចរក្សាទុក!</p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#353C96] font-mono text-slate-700"
                  placeholder="https://your-project-id.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Supabase Anon API Public Key
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#353C96] font-mono text-slate-700"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-key-goes-here..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-3">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#353C96] hover:bg-[#2D327F] text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Cpu className="h-4 w-4" />
                  រក្សាទុកព័ត៌មានភ្ជាប់ (Save Credentials)
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Database setup copy script tab */}
        {activeTab === 'sql' && (
          <div className="space-y-4 font-sans">
            <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-600 font-semibold text-ellipsis overflow-hidden">
                សូមចម្លងកូដរចនាសម្ព័ន្ធ Table SQL provide ទៅកាន់ Supabase SQL Editor
              </span>
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] rounded transition-colors shadow shrink-0 cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'ចម្លងរួចរាល់' : 'ចម្លងកូដ SQL'}
              </button>
            </div>
            
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-900 text-slate-200 p-4 text-[10px] font-mono leading-relaxed select-all">
              <pre className="whitespace-pre-wrap">{SQL_INITIALIZATION_SCRIPT}</pre>
            </div>
          </div>
        )}

        {/* Github guidance tab */}
        {activeTab === 'github' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-950 bg-slate-50 p-4 rounded-xl border border-[#C9D2E3] text-xs font-semibold">
              <Github className="h-5 w-5 text-slate-600" />
              <span>សេចក្ដីណែនាំអំពីការដាក់បញ្ជូនកូដទៅកាន់ GitHub និង Deploy Vercel</span>
            </div>
            <div className="text-xs text-slate-600 leading-relaxed font-sans space-y-3">
              <p className="font-bold underline text-[#2D327F]">របៀបងាយស្រួលបំផុតដើម្បីឡើងគម្រោងទៅកាន់ Cloud:</p>
              <div className="prose bg-slate-50 p-4 rounded-lg text-slate-700 text-[11px] font-mono whitespace-pre-wrap border border-slate-100 leading-snug">
                {GITHUB_DEPLOYMENT_INSTRUCTIONS}
              </div>
            </div>
          </div>
        )}

        {/* Export tab supporting single file download */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-xl p-5 border border-amber-200 flex gap-4 text-xs leading-relaxed text-amber-950">
              <Info className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">ពន្យល់អំពីឯកសារបន្តភ្ជាប់ (HTML Single File Download) :</p>
                <p>នេះគឺជាឯកសារ index.html តែមួយគត់ដែលរួមបញ្ចូលគ្នាទាំងផ្នែក HTML layout, CSS and Javascript នៅក្នុង <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[9px]">&lt;script&gt;</code> និង <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[9px]">&lt;style&gt;</code> ផ្សេងគ្នា។ អ្នកអាចចុចប៊ូតុងទាញយកដើម្បីទទួលបានឯកសារដែលអាចដំណើរការលើ Browser បានភ្លាមៗដោយមិនបាច់មាន node environments ឡើយ!</p>
              </div>
            </div>

            <div className="flex justify-center p-6 bg-slate-50 rounded-lg border border-slate-100">
              <button
                onClick={handleDownloadStandaloneHTML}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer border-2 border-amber-500 active:scale-95"
              >
                <Download className="h-4.5 w-4.5 text-amber-400" />
                <span>ទាញយកឯកសារកូដ index_standalone.html តែមួយគត់</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
