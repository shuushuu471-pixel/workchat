"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, onSnapshot, deleteDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Template } from "@/types";
import { X, Plus, BookOpen, Trash2, FileText } from "lucide-react";

interface Props {
  groupId: string;
  userId: string;
  userName: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}

export default function TemplateManager({ groupId, userId, userName, onInsert, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newText, setNewText] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "templates"), (snap) => {
      const data = snap.docs
        .map((d) => {
          const raw = d.data();
          return { id: d.id, ...raw, createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toDate() : new Date() } as Template;
        })
        .filter((t) => t.groupId === groupId);
      setTemplates(data);
    });
  }, [groupId]);

  const addTemplate = async () => {
    if (!newText.trim()) return;
    await addDoc(collection(db, "templates"), {
      groupId, text: newText.trim(), label: newLabel.trim() || newText.slice(0, 20),
      createdBy: userId, createdByName: userName, createdAt: serverTimestamp(),
    });
    setNewLabel(""); setNewText(""); setShowAdd(false);
  };

  const deleteTemplate = async (id: string) => {
    await deleteDoc(doc(db, "templates", id));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">定型文</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {templates.length === 0 && !showAdd && (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <FileText className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">定型文がありません</p>
              <p className="text-xs">よく使う文を登録しておくと便利です</p>
            </div>
          )}
          {templates.map((t) => (
            <div key={t.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl hover:bg-blue-50 group transition-colors">
              <button
                onClick={() => { onInsert(t.text); onClose(); }}
                className="flex-1 text-left"
              >
                <p className="text-xs font-semibold text-blue-600 mb-0.5">{t.label}</p>
                <p className="text-sm text-gray-700 leading-relaxed">{t.text}</p>
                <p className="text-xs text-gray-400 mt-1">{t.createdByName}</p>
              </button>
              <button onClick={() => deleteTemplate(t.id)} className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {showAdd ? (
          <div className="border-t border-gray-100 pt-4 flex-shrink-0">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">ラベル（任意）</label>
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="例: 挨拶文" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">定型文 *</label>
                <textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={3} placeholder="送信する定型文を入力" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" autoFocus />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowAdd(false); setNewLabel(""); setNewText(""); }} className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm">キャンセル</button>
                <button onClick={addTemplate} disabled={!newText.trim()} className="flex-1 bg-blue-600 disabled:bg-blue-300 text-white px-3 py-2 rounded-lg text-sm font-medium">追加</button>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600 rounded-xl text-sm font-medium transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" />定型文を追加
          </button>
        )}
      </div>
    </div>
  );
}
