import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';
import { subscribeToUpdates, applyUpdate } from '../services/updateCheck';

const UpdateNotification: React.FC = () => {
    const [showUpdate, setShowUpdate] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeToUpdates((available) => {
            setShowUpdate(available);
        });
        return unsubscribe;
    }, []);

    if (!showUpdate) return null;

    return (
        <button
            onClick={(e) => { e.currentTarget.blur(); applyUpdate(); }}
            tabIndex={-1}
            className="fixed bottom-16 right-6 z-[9998] group animate-in slide-in-from-right-8 fade-in duration-500 outline-none focus:outline-none"
        >
            <div className="bg-[#18181b]/80 backdrop-blur-xl border border-white/10 rounded-full py-2 pl-3 pr-2 flex items-center gap-3 shadow-2xl hover:border-indigo-500/50 hover:bg-[#18181b] transition-all duration-300 active:scale-95 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]">

                {/* Icon & Pulse */}
                <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                    <Sparkles size={14} className="animate-pulse" />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-ping" />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                </div>

                {/* Text */}
                <div className="flex flex-col items-start mr-1">
                    <span className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors">新版本可用</span>
                </div>

                {/* Action Icon */}
                <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center group-hover:-translate-y-0.5 group-hover:shadow-lg transition-all duration-300">
                    <ArrowUp size={16} className="text-indigo-600 font-bold" strokeWidth={3} />
                </div>
            </div>
        </button>
    );
};

export default UpdateNotification;
