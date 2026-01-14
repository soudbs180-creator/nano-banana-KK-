import React, { useState } from 'react';
import { GeneratedImage, ModelType } from '../types';
import { Download, Sparkles, Loader2, Zap } from 'lucide-react';
import { analyzeImageContent } from '../services/geminiService';

interface ImageCardProps {
  image: GeneratedImage;
  apiKey?: string;
}

const ImageCard: React.FC<ImageCardProps> = ({ image, apiKey }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `banana-gen-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const base64Data = image.url.split(',')[1];
      const result = await analyzeImageContent(base64Data, 'image/png', undefined, apiKey);
      setAnalysis(result);
    } catch (error) {
      setAnalysis("Failed to analyze.");
    } finally {
      setAnalyzing(false);
    }
  };

  const formattedDate = new Date(image.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="group relative bg-[#18181b] rounded-2xl overflow-hidden border border-white/5 shadow-lg flex flex-col h-full hover:border-white/10 transition-colors">
      
      {/* Image Container */}
      <div className="relative aspect-auto bg-black/50">
        <img 
            src={image.url} 
            alt={image.prompt} 
            className="w-full h-auto object-cover"
            loading="lazy"
        />
        {/* Hover Actions Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
             <button onClick={handleDownload} className="bg-black/50 backdrop-blur text-white p-2 rounded-full hover:bg-black hover:text-white border border-white/10 transition-all transform hover:scale-110">
                 <Download className="w-4 h-4" />
             </button>
             <button onClick={handleAnalyze} className="bg-black/50 backdrop-blur text-white p-2 rounded-full hover:bg-black hover:text-white border border-white/10 transition-all transform hover:scale-110">
                 {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
             </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
          <div className="space-y-2">
             <p className="text-[13px] text-zinc-300 leading-relaxed font-light line-clamp-3">
               {image.prompt}
             </p>
             {analysis && (
                <div className="bg-zinc-900/50 p-2 rounded-lg text-[11px] text-zinc-400 border border-white/5 animate-in slide-in-from-top-1">
                    <span className="text-yellow-500 font-medium block mb-1">Analysis</span>
                    {analysis}
                </div>
             )}
          </div>

          {/* Footer Metadata */}
          <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-2">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <Zap className={`w-3 h-3 ${image.model === ModelType.PRO_QUALITY ? 'text-yellow-500 fill-yellow-500/20' : 'text-blue-400 fill-blue-400/20'}`} />
                  <span className="font-medium tracking-tight">
                    {image.model === ModelType.PRO_QUALITY ? 'Nano Banana Pro' : 'Nano Flash'}
                  </span>
                  {image.model === ModelType.PRO_QUALITY && (
                      <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-1 rounded">Pro</span>
                  )}
              </div>
              <span className="text-[10px] text-zinc-600 font-mono">{formattedDate}</span>
          </div>
      </div>
    </div>
  );
};

export default ImageCard;
