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
            className="group animate-in fade-in zoom-in duration-300 outline-none focus:outline-none"
        >
            <div className="glass h-10 px-3 rounded-xl flex items-center gap-2 border border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all cursor-pointer shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                <Sparkles size={12} className="text-indigo-400 animate-pulse" />
                <span className="text-xs font-semibold text-indigo-300">新版本可用</span>
                <ArrowUp size={12} className="text-indigo-400" />
            </div>
        </button>
    );
};


export default UpdateNotification;
