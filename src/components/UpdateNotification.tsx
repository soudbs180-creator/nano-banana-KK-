import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
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
        <div className="fixed bottom-4 right-4 z-[9998] animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg p-4 flex items-center gap-3 max-w-sm border border-white/10">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                    <RefreshCw size={20} className="animate-spin-slow" />
                </div>
                <div className="flex-1">
                    <div className="font-medium text-sm">新版本可用</div>
                    <div className="text-xs text-white/70 mt-0.5">点击刷新获取最新功能</div>
                </div>
                <button
                    onClick={applyUpdate}
                    className="px-4 py-2 bg-white text-blue-600 font-medium text-sm rounded-lg hover:bg-white/90 transition-colors shrink-0"
                >
                    刷新
                </button>
            </div>
        </div>
    );
};

export default UpdateNotification;
