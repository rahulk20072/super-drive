import React from 'react';
import { FileText, Image as ImageIcon, File, MoreVertical, Calendar, Sparkles, Tag, Eye, Trash2, Edit2, Download, Video, Music } from 'lucide-react';
import { DriveFile } from '../types';
import { Badge, Button } from './UI';

// --- Helper Functions ---
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (timestamp: number) => {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
};

const getFileIcon = (type: DriveFile['type'], size?: number) => {
  const props = size ? { size } : {};
  switch (type) {
    case 'image': return <ImageIcon className="text-purple-500" {...props} />;
    case 'text': return <FileText className="text-blue-500" {...props} />;
    case 'pdf': return <FileText className="text-red-500" {...props} />;
    case 'video': return <Video className="text-pink-500" {...props} />;
    case 'audio': return <Music className="text-cyan-500" {...props} />;
    default: return <File className="text-gray-500" {...props} />;
  }
};

// --- Components ---

interface FileCardProps {
  file: DriveFile;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ file, onClick, onDelete, onEdit }) => {
  return (
    <div 
      className="group bg-white rounded-xl border border-gray-200 hover:border-gemini-400 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full"
      onClick={onClick}
    >
      {/* Preview Area */}
      <div className="h-40 bg-gray-50 relative overflow-hidden flex items-center justify-center">
        {file.type === 'image' ? (
          <img src={file.data} alt={file.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
           <div className="bg-gray-100 rounded-full p-6 group-hover:bg-gray-200 transition-colors">
             {getFileIcon(file.type, 48)}
           </div>
        )}
        
        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
          <button onClick={onEdit} className="p-2 bg-white rounded-full text-gray-700 hover:text-gemini-600 hover:scale-110 transition-all" title="Edit Details">
            <Edit2 size={16} />
          </button>
          <button onClick={onDelete} className="p-2 bg-white rounded-full text-gray-700 hover:text-red-600 hover:scale-110 transition-all" title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800 truncate" title={file.name}>{file.name}</h3>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <Calendar size={12} /> {formatDate(file.uploadDate)} • {formatBytes(file.size)}
            </p>
          </div>
        </div>

        {/* AI Summary/Tags Snippet */}
        <div className="mt-auto pt-3 border-t border-gray-100">
           {file.aiData?.isAnalyzing ? (
             <div className="flex items-center gap-2 text-xs text-gemini-600 animate-pulse">
               <Sparkles size={12} /> Analyzing content...
             </div>
           ) : file.aiData?.tags && file.aiData.tags.length > 0 ? (
             <div className="flex flex-wrap gap-1">
               {file.aiData.tags.slice(0, 3).map(tag => (
                 <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gemini-50 text-gemini-700 rounded-full border border-gemini-100">
                   #{tag}
                 </span>
               ))}
               {file.aiData.tags.length > 3 && <span className="text-[10px] text-gray-400">+{file.aiData.tags.length - 3}</span>}
             </div>
           ) : (
             <div className="text-xs text-gray-400 italic">No tags added</div>
           )}
        </div>
      </div>
    </div>
  );
};

interface FileViewerProps {
  file: DriveFile | null;
  onClose: () => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({ file, onClose }) => {
  if (!file) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
          <div>
            <h2 className="font-medium text-lg">{file.name}</h2>
            <p className="text-sm text-gray-400">{formatDate(file.uploadDate)} • {formatBytes(file.size)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="secondary" onClick={handleDownload} className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20">
             <Download size={18} /> Download
           </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-black/50">
          {file.type === 'image' ? (
            <img src={file.data} alt={file.name} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
          ) : file.type === 'pdf' ? (
             <iframe src={file.data} className="w-full h-full rounded-lg bg-white" title="PDF Viewer" />
          ) : file.type === 'video' ? (
             <video src={file.data} controls className="max-w-full max-h-full rounded-lg shadow-2xl" />
          ) : file.type === 'audio' ? (
             <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-2xl shadow-xl border border-gray-700">
                <Music size={64} className="text-cyan-400 mb-6 animate-pulse" />
                <audio src={file.data} controls className="w-80" />
             </div>
          ) : (
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full max-h-full overflow-auto whitespace-pre-wrap font-mono text-sm">
                {file.type === 'text' ? atob(file.data.split(',')[1]) : "Preview not available for this file type."}
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="w-80 bg-gray-900 border-l border-gray-800 p-6 flex flex-col gap-6 overflow-y-auto">
          
          {/* AI Summary Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gemini-400 flex items-center gap-2">
              <Sparkles size={16} /> AI Summary
            </h3>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              {file.aiData?.isAnalyzing ? (
                 <div className="animate-pulse flex space-x-2">
                   <div className="h-2 bg-gray-700 rounded w-full"></div>
                 </div>
              ) : (
                <p className="text-sm text-gray-300 leading-relaxed">
                  {file.aiData?.summary || "No summary available."}
                </p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
              <Tag size={16} /> Tags
            </h3>
            <div className="flex flex-wrap gap-2">
               {file.aiData?.tags?.map(tag => (
                 <span key={tag} className="px-2.5 py-1 rounded-full bg-gray-800 text-gray-300 text-xs border border-gray-700">
                   {tag}
                 </span>
               )) || <span className="text-gray-500 text-sm">No tags</span>}
            </div>
          </div>

          {/* User Notes */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
              <Edit2 size={16} /> Notes
            </h3>
            <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 border border-gray-700 whitespace-pre-wrap">
              {file.notes || <span className="text-gray-500 italic">No user notes added.</span>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

const XIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 18 18"/></svg>
);