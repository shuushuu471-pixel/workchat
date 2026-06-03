"use client";

import { useState, useEffect, useRef } from "react";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, Timestamp, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DMMessage } from "@/types";
import { Send, Heart, X, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Props {
  dmId: string;
  currentUserId: string;
  partnerName: string;
  onClose: () => void;
}

export default function DMChat({ dmId, currentUserId, partnerName, onClose }: Props) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, "dm_messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, async (snap) => {
      const data = snap.docs
        .map((d) => {
          const raw = d.data();
          return { id: d.id, ...raw, createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toDate() : new Date(), readBy: raw.readBy || [], likes: raw.likes || [] } as DMMessage;
        })
        .filter((m) => m.dmId === dmId);
      setMessages(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

      // 既読にする
      for (const msg of data) {
        if (!msg.readBy.includes(currentUserId)) {
          await updateDoc(doc(db, "dm_messages", msg.id), { readBy: arrayUnion(currentUserId) });
        }
      }
    });
  }, [dmId, currentUserId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const text = newMessage;
    setNewMessage("");
    await addDoc(collection(db, "dm_messages"), {
      dmId, senderId: currentUserId, content: text,
      createdAt: serverTimestamp(), readBy: [currentUserId], likes: [],
    });
  };

  const toggleLike = async (msgId: string, liked: boolean) => {
    await updateDoc(doc(db, "dm_messages", msgId), {
      likes: liked
        ? messages.find((m) => m.id === msgId)?.likes.filter((id) => id !== currentUserId)
        : arrayUnion(currentUserId),
    });
  };

  const formatTime = (d: Date) => format(d, "HH:mm", { locale: ja });

  const unreadCount = messages.filter((m) => m.senderId !== currentUserId && !m.readBy.includes(currentUserId)).length;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <button onClick={onClose} className="sm:hidden text-gray-500 mr-1"><ArrowLeft className="w-5 h-5" /></button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
          {partnerName.charAt(0)}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">{partnerName}</p>
          <p className="text-xs text-gray-400">ダイレクトメッセージ</p>
        </div>
        <button onClick={onClose} className="hidden sm:block text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-sm">{partnerName}さんにDMを送りましょう</p>
          </div>
        ) : messages.map((msg, i) => {
          const isMe = msg.senderId === currentUserId;
          const liked = msg.likes?.includes(currentUserId);
          const likeCount = msg.likes?.length ?? 0;
          const isRead = msg.senderId === currentUserId && msg.readBy.length > 1;
          return (
            <div key={msg.id} className={`group flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div className="flex items-end gap-1">
                  {isMe && <span className="text-xs text-gray-400">{formatTime(msg.createdAt)}</span>}
                  <div className="relative pb-1">
                    <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? "bg-purple-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-900 rounded-bl-sm"}`}>
                      {msg.content}
                    </div>
                    <button
                      onClick={() => toggleLike(msg.id, !!liked)}
                      className={`absolute -bottom-0.5 ${isMe ? "-left-2" : "-right-2"} flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border shadow-sm opacity-0 group-hover:opacity-100 transition-all
                        ${liked ? "bg-red-50 border-red-200 text-red-500" : "bg-white border-gray-200 text-gray-400 hover:text-red-400"}`}
                    >
                      <Heart className={`w-3 h-3 ${liked ? "fill-red-400 text-red-400" : ""}`} />
                    </button>
                  </div>
                  {!isMe && <span className="text-xs text-gray-400">{formatTime(msg.createdAt)}</span>}
                </div>
                {likeCount > 0 && (
                  <button onClick={() => toggleLike(msg.id, !!liked)} className={`mt-0.5 mx-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border shadow-sm ${liked ? "bg-red-50 border-red-200 text-red-500" : "bg-white border-gray-200 text-gray-500"}`}>
                    <Heart className={`w-3 h-3 ${liked ? "fill-red-400 text-red-400" : ""}`} />{likeCount}
                  </button>
                )}
                {isMe && isRead && <span className="text-xs text-gray-400 mt-0.5 mx-1">既読</span>}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="border-t border-gray-200 p-3 flex-shrink-0">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
          <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={`${partnerName}さんにメッセージ`} className="flex-1 bg-transparent outline-none text-sm placeholder-gray-400" />
          <button type="submit" disabled={!newMessage.trim()} className="text-purple-600 disabled:text-gray-300"><Send className="w-4 h-4" /></button>
        </div>
      </form>
    </div>
  );
}
