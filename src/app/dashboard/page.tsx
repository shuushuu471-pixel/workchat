"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, Timestamp, doc, updateDoc, deleteDoc, getDocs,
  arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Group, Message, Task, TaskStatus, TaskPriority } from "@/types";
import {
  MessageSquare, Plus, LogOut, Send, X, Hash, Clock,
  CheckCircle2, Circle, CalendarClock, Users, CheckSquare, Bell,
  Heart, Menu, ChevronLeft, ListTodo, UserPlus, Trash2,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { ja } from "date-fns/locale";

const GROUP_COLORS = [
  "bg-blue-500","bg-purple-500","bg-green-500","bg-orange-500",
  "bg-pink-500","bg-teal-500","bg-red-500","bg-indigo-500",
];
const PRIORITY_LABELS: Record<TaskPriority,string> = { low:"低", medium:"中", high:"高" };
const PRIORITY_COLORS: Record<TaskPriority,string> = {
  low:"text-gray-500 bg-gray-100", medium:"text-yellow-700 bg-yellow-100", high:"text-red-700 bg-red-100",
};
const STATUS_ICONS: Record<TaskStatus,React.ReactNode> = {
  todo: <Circle className="w-4 h-4 text-gray-400" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
};
const STATUS_LABELS: Record<TaskStatus,string> = { todo:"未着手", in_progress:"進行中", done:"完了" };

interface UserProfile { uid:string; displayName:string; email:string; }
interface Assignee { uid:string; name:string; }
interface ScheduledMessage { id:string; groupId:string; senderId:string; senderName:string; content:string; scheduledAt:Date; sent:boolean; }
interface Toast { id:string; title:string; body:string; }

type MobileTab = "chat" | "tasks" | "members";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string,string>>({});
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [likePopover, setLikePopover] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const knownTaskIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<Assignee[]>([]);

  const addToast = useCallback((title:string, body:string) => {
    const id = crypto.randomUUID();
    setToasts((p) => [...p, { id, title, body }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  }, []);

  // Load all users for name lookup
  useEffect(() => {
    getDocs(collection(db, "users")).then((snap) => {
      const map: Record<string,string> = {};
      snap.docs.forEach((d) => { const u = d.data(); map[u.uid] = u.displayName || u.email; });
      setUsersMap(map);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "groups"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group))
        .filter((g) => g.memberIds?.includes(user.uid));
      setGroups(data);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedGroup) return;
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => {
        const raw = d.data();
        return { id:d.id, ...raw, createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toDate() : new Date(), likes: raw.likes || [] } as Message;
      }).filter((m) => m.groupId === selectedGroup.id);
      setMessages(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:"smooth" }), 50);
    });
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedGroup || !user) return;
    isFirstLoad.current = true;
    return onSnapshot(collection(db, "tasks"), (snap) => {
      const data = snap.docs.map((d) => {
        const raw = d.data();
        return { id:d.id, ...raw, createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toDate() : new Date(), dueDate: raw.dueDate instanceof Timestamp ? raw.dueDate.toDate() : raw.dueDate ? new Date(raw.dueDate) : undefined, assignees: raw.assignees || [] } as Task & { assignees: Assignee[] };
      }).filter((t) => t.groupId === selectedGroup.id);

      if (!isFirstLoad.current) {
        data.forEach((task) => {
          if (!knownTaskIds.current.has(task.id)) {
            const t = task as Task & { assignees: Assignee[] };
            if (t.assignees?.some((a:Assignee) => a.uid === user.uid)) {
              addToast("タスクが割り当てられました", t.title);
              if (Notification.permission === "granted") new Notification("新しいタスク", { body: t.title });
            }
            knownTaskIds.current.add(task.id);
          }
        });
      } else {
        data.forEach((t) => knownTaskIds.current.add(t.id));
        isFirstLoad.current = false;
      }
      setTasks(data);
    });
  }, [selectedGroup, user, addToast]);

  useEffect(() => {
    if (!selectedGroup) return;
    return onSnapshot(collection(db, "scheduled_messages"), (snap) => {
      const data = snap.docs.map((d) => {
        const raw = d.data();
        return { id:d.id, ...raw, scheduledAt: raw.scheduledAt instanceof Timestamp ? raw.scheduledAt.toDate() : new Date(raw.scheduledAt) } as ScheduledMessage;
      }).filter((m) => m.groupId === selectedGroup.id && !m.sent);
      setScheduledMessages(data);
    });
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) return;
    getDocs(collection(db, "users")).then((snap) => {
      const all = snap.docs.map((d) => d.data() as UserProfile);
      setMembers(all.filter((u) => selectedGroup.memberIds?.includes(u.uid)));
    });
  }, [selectedGroup]);

  useEffect(() => { if (Notification.permission === "default") Notification.requestPermission(); }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      for (const sm of scheduledMessages) {
        if (isPast(sm.scheduledAt)) {
          await addDoc(collection(db, "messages"), { groupId:sm.groupId, senderId:sm.senderId, senderName:sm.senderName, content:sm.content, createdAt:serverTimestamp(), likes:[] });
          await updateDoc(doc(db, "scheduled_messages", sm.id), { sent:true });
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [scheduledMessages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup || !user) return;
    const text = newMessage;
    setNewMessage("");
    if (showSchedule && scheduleDateTime) {
      await addDoc(collection(db, "scheduled_messages"), { groupId:selectedGroup.id, senderId:user.uid, senderName:user.displayName||user.email, content:text, scheduledAt:new Date(scheduleDateTime), sent:false, createdAt:serverTimestamp() });
      setShowSchedule(false); setScheduleDateTime("");
    } else {
      await addDoc(collection(db, "messages"), { groupId:selectedGroup.id, senderId:user.uid, senderName:user.displayName||user.email, content:text, createdAt:serverTimestamp(), likes:[] });
    }
  };

  // 全ユーザー読み込み（メンバー追加用）
  useEffect(() => {
    getDocs(collection(db, "users")).then((snap) => {
      setAllUsers(snap.docs.map((d) => d.data() as UserProfile));
    });
  }, []);

  const addMember = async (targetUser: UserProfile) => {
    if (!selectedGroup) return;
    await updateDoc(doc(db, "groups", selectedGroup.id), {
      memberIds: arrayUnion(targetUser.uid),
    });
    setMembers((prev) => [...prev, targetUser]);
    setSelectedGroup((prev) => prev ? { ...prev, memberIds: [...(prev.memberIds || []), targetUser.uid] } : prev);
  };

  const removeMember = async (uid: string) => {
    if (!selectedGroup || uid === selectedGroup.createdBy) return;
    await updateDoc(doc(db, "groups", selectedGroup.id), {
      memberIds: arrayRemove(uid),
    });
    setMembers((prev) => prev.filter((m) => m.uid !== uid));
    setSelectedGroup((prev) => prev ? { ...prev, memberIds: prev.memberIds.filter((id) => id !== uid) } : prev);
  };

  const toggleLike = async (messageId: string, liked: boolean) => {
    if (!user) return;
    await updateDoc(doc(db, "messages", messageId), { likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
  };

  const createGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
    await addDoc(collection(db, "groups"), { name:newGroupName.trim(), description:newGroupDesc.trim(), memberIds:[user.uid], createdBy:user.uid, createdAt:serverTimestamp(), iconColor:color });
    setNewGroupName(""); setNewGroupDesc(""); setShowCreateGroup(false);
  };

  const createTask = async () => {
    if (!taskTitle.trim() || !selectedGroup || !user || selectedAssignees.length === 0) return;
    await addDoc(collection(db, "tasks"), { groupId:selectedGroup.id, title:taskTitle.trim(), description:taskDesc.trim(), status:"todo", priority:taskPriority, assignees:selectedAssignees, createdBy:user.uid, createdAt:serverTimestamp(), dueDate:taskDueDate ? new Date(taskDueDate) : null });
    setTaskTitle(""); setTaskDesc(""); setTaskPriority("medium"); setTaskDueDate(""); setSelectedAssignees([]);
    setShowCreateTask(false);
  };

  const toggleAssignee = (member: UserProfile) => {
    setSelectedAssignees((prev) => prev.find((a) => a.uid === member.uid) ? prev.filter((a) => a.uid !== member.uid) : [...prev, { uid:member.uid, name:member.displayName||member.email }]);
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => { await updateDoc(doc(db, "tasks", taskId), { status }); };
  const deleteTask = async (taskId: string) => { await deleteDoc(doc(db, "tasks", taskId)); };
  const cancelScheduled = async (id: string) => { await deleteDoc(doc(db, "scheduled_messages", id)); };

  const formatTime = (date: Date) => format(date, "HH:mm", { locale: ja });
  const formatDateTime = (date: Date) => format(date, "M/d HH:mm", { locale: ja });
  const minDateTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);

  const selectGroup = (group: Group) => {
    setSelectedGroup(group);
    setShowSidebar(false);
    setMobileTab("chat");
  };

  // ── Shared UI blocks ──
  const ChatPanel = (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {scheduledMessages.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
          <p className="text-xs text-amber-700 font-medium mb-1 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />予約投稿 ({scheduledMessages.length}件)</p>
          {scheduledMessages.map((sm) => (
            <div key={sm.id} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-amber-200 mb-1 text-xs">
              <span className="text-amber-600 font-medium mr-2 whitespace-nowrap">{formatDateTime(sm.scheduledAt)}</span>
              <span className="text-gray-600 truncate flex-1">{sm.content}</span>
              <button onClick={() => cancelScheduled(sm.id)}><X className="w-3 h-3 text-gray-400 hover:text-red-500 ml-1" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Hash className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">最初のメッセージを送りましょう！</p>
          </div>
        ) : messages.map((msg, i) => {
          const isMe = msg.senderId === user?.uid;
          const showSender = i === 0 || messages[i-1].senderId !== msg.senderId;
          const liked = msg.likes?.includes(user?.uid ?? "");
          const likeCount = msg.likes?.length ?? 0;
          const likerNames = msg.likes?.map((uid) => usersMap[uid] || uid) ?? [];
          return (
            <div key={msg.id} className={`group flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] sm:max-w-[70%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {showSender && !isMe && <span className="text-xs text-gray-500 mb-1 px-1">{msg.senderName}</span>}
                <div className="flex items-end gap-1">
                  {isMe && <span className="text-xs text-gray-400 hidden sm:block">{formatTime(msg.createdAt)}</span>}
                  <div className="relative pb-2">
                    <div className={`px-3 py-2 rounded-2xl text-sm break-words ${isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-white text-gray-900 shadow-sm border border-gray-100 rounded-bl-sm"}`}>
                      {msg.content}
                    </div>
                    <button
                      onClick={() => toggleLike(msg.id, liked)}
                      className={`absolute -bottom-0.5 ${isMe ? "-left-2" : "-right-2"} flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border shadow-sm transition-all
                        opacity-0 group-hover:opacity-100
                        ${liked ? "bg-red-50 border-red-200 text-red-500" : "bg-white border-gray-200 text-gray-400 hover:text-red-400 hover:border-red-200"}`}
                    >
                      <Heart className={`w-3 h-3 ${liked ? "fill-red-400 text-red-400" : ""}`} />
                    </button>
                  </div>
                  {!isMe && <span className="text-xs text-gray-400 hidden sm:block">{formatTime(msg.createdAt)}</span>}
                </div>
                {/* Like count + popover */}
                {likeCount > 0 && (
                  <div className="relative mt-0.5 mx-1">
                    <button
                      onClick={() => setLikePopover(likePopover === msg.id ? null : msg.id)}
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border shadow-sm transition-colors ${liked ? "bg-red-50 border-red-200 text-red-500" : "bg-white border-gray-200 text-gray-500 hover:text-red-400"}`}
                    >
                      <Heart className={`w-3 h-3 ${liked ? "fill-red-400 text-red-400" : ""}`} />
                      <span>{likeCount}</span>
                    </button>
                    {likePopover === msg.id && (
                      <div className={`absolute bottom-full mb-1 ${isMe ? "right-0" : "left-0"} bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-xl z-10 whitespace-nowrap`}>
                        <p className="font-medium mb-0.5">いいねした人</p>
                        {likerNames.map((name, idx) => <p key={idx} className="text-gray-300">{name}</p>)}
                      </div>
                    )}
                  </div>
                )}
                <span className="text-xs text-gray-400 sm:hidden mt-0.5 px-1">{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="bg-white border-t border-gray-200 p-3 flex-shrink-0">
        {showSchedule && (
          <div className="flex items-center gap-2 mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <CalendarClock className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <input type="datetime-local" value={scheduleDateTime} onChange={(e) => setScheduleDateTime(e.target.value)} min={minDateTime} className="flex-1 text-sm bg-transparent outline-none text-gray-700" />
            <button type="button" onClick={() => { setShowSchedule(false); setScheduleDateTime(""); }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
        )}
        {showSchedule && scheduleDateTime && (
          <p className="text-xs text-amber-600 mb-1.5 px-1">{format(new Date(scheduleDateTime), "M月d日 HH:mm", { locale:ja })} に送信予定</p>
        )}
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
          <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={showSchedule ? "予約メッセージを入力" : "メッセージを送る"} className="flex-1 bg-transparent outline-none text-sm placeholder-gray-400 min-w-0" />
          <button type="button" onClick={() => setShowSchedule(!showSchedule)} className={`flex-shrink-0 transition-colors ${showSchedule ? "text-amber-500" : "text-gray-400 hover:text-amber-500"}`}>
            <CalendarClock className="w-4 h-4" />
          </button>
          <button type="submit" disabled={!newMessage.trim() || (showSchedule && !scheduleDateTime)} className="flex-shrink-0 text-blue-600 disabled:text-gray-300 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );

  const TasksPanel = (
    <div className="flex flex-col overflow-hidden bg-gray-50 h-full">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-800 text-sm">タスク</span>
          {tasks.filter((t) => t.status !== "done").length > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{tasks.filter((t) => t.status !== "done").length}</span>
          )}
        </div>
        <button onClick={() => setShowCreateTask(true)} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium">
          <Plus className="w-3 h-3" />追加
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {(["todo","in_progress","done"] as TaskStatus[]).map((status) => {
          const st = tasks.filter((t) => t.status === status);
          if (st.length === 0) return null;
          return (
            <div key={status}>
              <div className="flex items-center gap-1.5 mb-1.5">{STATUS_ICONS[status]}<span className="text-xs font-semibold text-gray-500">{STATUS_LABELS[status]}</span><span className="text-xs text-gray-400">({st.length})</span></div>
              <div className="space-y-1.5">
                {st.map((task) => {
                  const t = task as Task & { assignees?: Assignee[] };
                  return (
                    <div key={task.id} className="bg-white rounded-lg p-2.5 border border-gray-100 shadow-sm">
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className={`text-xs font-medium leading-snug ${task.status === "done" ? "line-through text-gray-400" : "text-gray-900"}`}>{task.title}</p>
                        <button onClick={() => deleteTask(task.id)} className="text-gray-200 hover:text-red-400 flex-shrink-0"><X className="w-3 h-3" /></button>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
                        {t.assignees?.map((a:Assignee) => <span key={a.uid} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{a.name}</span>)}
                        {task.dueDate && <span className="text-xs text-gray-500 flex items-center gap-0.5"><Clock className="w-3 h-3" />{format(task.dueDate, "M/d HH:mm", { locale:ja })}</span>}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {(["todo","in_progress","done"] as TaskStatus[]).filter((s) => s !== status).map((s) => (
                          <button key={s} onClick={() => updateTaskStatus(task.id, s)} className="text-xs text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded">→ {STATUS_LABELS[s]}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <CheckSquare className="w-8 h-8 mb-2 opacity-30" /><p className="text-xs">タスクがありません</p>
          </div>
        )}
      </div>
    </div>
  );

  const MembersPanel = (
    <div className="flex flex-col overflow-hidden bg-gray-50 h-full">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-1.5 flex-shrink-0">
        <Users className="w-4 h-4 text-gray-500" />
        <span className="font-semibold text-gray-800 text-sm">メンバー</span>
        <span className="text-xs text-gray-400">({selectedGroup?.memberIds?.length || 0}人)</span>
        {selectedGroup?.createdBy === user?.uid && (
          <button onClick={() => setShowAddMember(true)} className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors">
            <UserPlus className="w-3.5 h-3.5" />追加
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {members.map((member) => (
          <div key={member.uid} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {(member.displayName || member.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{member.displayName || "名前未設定"}</p>
              <p className="text-xs text-gray-400 truncate">{member.email}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {member.uid === user?.uid && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">自分</span>}
              {member.uid === selectedGroup?.createdBy && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">管理者</span>}
              {selectedGroup?.createdBy === user?.uid && member.uid !== user?.uid && member.uid !== selectedGroup?.createdBy && (
                <button onClick={() => removeMember(member.uid)} className="text-gray-300 hover:text-red-400 transition-colors ml-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden" onClick={() => setLikePopover(null)}>
      {/* Toast */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 flex items-start gap-3 w-72 pointer-events-auto">
            <div className="bg-blue-100 p-1.5 rounded-lg flex-shrink-0"><Bell className="w-4 h-4 text-blue-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{t.title}</p>
              <p className="text-xs text-gray-500 truncate">{t.body}</p>
            </div>
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSidebar(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-gray-900 text-white flex flex-col z-50">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="bg-blue-600 p-1.5 rounded-lg"><MessageSquare className="w-4 h-4" /></div>
                  <span className="font-bold">WorkChat</span>
                </div>
                <p className="text-gray-400 text-xs mt-1 truncate">{user?.displayName || user?.email}</p>
              </div>
              <button onClick={() => setShowSidebar(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">グループ</span>
                <button onClick={() => { setShowCreateGroup(true); setShowSidebar(false); }} className="text-gray-400 hover:text-white"><Plus className="w-4 h-4" /></button>
              </div>
              {groups.map((group) => (
                <button key={group.id} onClick={() => selectGroup(group)} className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg mb-0.5 text-left transition-colors ${selectedGroup?.id === group.id ? "bg-blue-600" : "text-gray-300 hover:bg-gray-700"}`}>
                  <div className={`w-7 h-7 rounded-lg ${group.iconColor||"bg-blue-500"} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{group.name.charAt(0)}</div>
                  <span className="text-sm truncate">{group.name}</span>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-gray-700">
              <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg text-sm"><LogOut className="w-4 h-4" />ログアウト</button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden sm:flex w-56 bg-gray-900 text-white flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg"><MessageSquare className="w-4 h-4" /></div>
            <span className="font-bold">WorkChat</span>
          </div>
          <p className="text-gray-400 text-xs mt-1 truncate">{user?.displayName || user?.email}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">グループ</span>
            <button onClick={() => setShowCreateGroup(true)} className="text-gray-400 hover:text-white"><Plus className="w-4 h-4" /></button>
          </div>
          {groups.length === 0 ? <p className="text-gray-500 text-xs px-2 py-1">グループがありません</p> :
            groups.map((group) => (
              <button key={group.id} onClick={() => selectGroup(group)} className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg mb-0.5 text-left transition-colors ${selectedGroup?.id === group.id ? "bg-blue-600" : "text-gray-300 hover:bg-gray-700"}`}>
                <div className={`w-7 h-7 rounded-lg ${group.iconColor||"bg-blue-500"} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{group.name.charAt(0)}</div>
                <span className="text-sm truncate">{group.name}</span>
              </button>
            ))
          }
        </div>
        <div className="p-3 border-t border-gray-700">
          <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg text-sm"><LogOut className="w-4 h-4" />ログアウト</button>
        </div>
      </div>

      {/* Main content */}
      {selectedGroup ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-3 flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowSidebar(true)} className="sm:hidden text-gray-500 hover:text-gray-700 mr-1">
              <Menu className="w-5 h-5" />
            </button>
            <div className={`w-6 h-6 rounded-md ${selectedGroup.iconColor||"bg-blue-500"} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
              {selectedGroup.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-gray-900 text-sm truncate">{selectedGroup.name}</h1>
              {selectedGroup.description && <p className="text-gray-400 text-xs truncate hidden sm:block">{selectedGroup.description}</p>}
            </div>
          </div>

          {/* Desktop: 3-column layout */}
          <div className="hidden sm:flex flex-1 overflow-hidden">
            <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-white">
              {ChatPanel}
            </div>
            <div className="flex flex-col w-72 flex-shrink-0 overflow-hidden border-r border-gray-200" style={{flex:"0 0 18rem"}}>
              <div className="flex-1 overflow-hidden flex flex-col border-b border-gray-200" style={{height:"60%"}}>
                {TasksPanel}
              </div>
              <div className="overflow-hidden flex flex-col" style={{height:"40%"}}>
                {MembersPanel}
              </div>
            </div>
          </div>

          {/* Mobile: tab content */}
          <div className="flex sm:hidden flex-1 overflow-hidden bg-white">
            {mobileTab === "chat" && ChatPanel}
            {mobileTab === "tasks" && <div className="flex-1 overflow-hidden">{TasksPanel}</div>}
            {mobileTab === "members" && <div className="flex-1 overflow-hidden">{MembersPanel}</div>}
          </div>

          {/* Mobile bottom tab bar */}
          <div className="flex sm:hidden bg-white border-t border-gray-200 flex-shrink-0">
            {([
              { key:"chat", icon:<MessageSquare className="w-5 h-5" />, label:"チャット" },
              { key:"tasks", icon:<ListTodo className="w-5 h-5" />, label:"タスク" },
              { key:"members", icon:<Users className="w-5 h-5" />, label:"メンバー" },
            ] as { key:MobileTab; icon:React.ReactNode; label:string }[]).map((tab) => (
              <button key={tab.key} onClick={() => setMobileTab(tab.key)} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${mobileTab === tab.key ? "text-blue-600" : "text-gray-400"}`}>
                {tab.icon}{tab.label}
                {tab.key === "tasks" && tasks.filter((t) => t.status !== "done").length > 0 && (
                  <span className="absolute mt-0 -translate-y-4 translate-x-3 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {tasks.filter((t) => t.status !== "done").length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar when no group selected */}
          <div className="sm:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
            <button onClick={() => setShowSidebar(true)} className="text-gray-500"><Menu className="w-5 h-5" /></button>
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-1.5 rounded-lg"><MessageSquare className="w-4 h-4 text-white" /></div>
              <span className="font-bold text-gray-900">WorkChat</span>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center px-4">
              <MessageSquare className="w-14 h-14 text-gray-300 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-500 mb-1">グループを選択してください</h2>
              <p className="text-gray-400 text-sm mb-4">グループを選ぶか、新しく作成しましょう</p>
              <button onClick={() => setShowCreateGroup(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium mx-auto transition-colors">
                <Plus className="w-4 h-4" />グループを作成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">新しいグループを作成</h2>
              <button onClick={() => setShowCreateGroup(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">グループ名 *</label>
                <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="例: 営業チーム" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明（任意）</label>
                <input value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="グループの説明" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreateGroup(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">キャンセル</button>
                <button onClick={createGroup} disabled={!newGroupName.trim()} className="flex-1 bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2.5 rounded-lg text-sm font-medium">作成</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">メンバーを追加</h2>
              <button onClick={() => { setShowAddMember(false); setMemberSearch(""); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="名前またはメールで検索"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-3"
              autoFocus
            />
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {allUsers
                .filter((u) => !selectedGroup?.memberIds?.includes(u.uid))
                .filter((u) => {
                  const q = memberSearch.toLowerCase();
                  return !q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
                })
                .map((u) => (
                  <div key={u.uid} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {(u.displayName || u.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{u.displayName}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                    <button
                      onClick={() => addMember(u)}
                      className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />追加
                    </button>
                  </div>
                ))}
              {allUsers.filter((u) => !selectedGroup?.memberIds?.includes(u.uid)).length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">追加できるユーザーがいません</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">タスクを追加</h2>
              <button onClick={() => setShowCreateTask(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タスク名 *</label>
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="タスクの内容" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">詳細（任意）</label>
                <textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" placeholder="詳細な説明" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                  <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white">
                    <option value="low">低</option><option value="medium">中</option><option value="high">高</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">期限（日時）</label>
                  <input type="datetime-local" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  担当者 * <span className="text-gray-400 font-normal">（複数選択可）</span>
                </label>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  {members.length === 0 ? <p className="text-sm text-gray-400 px-3 py-2">メンバーがいません</p> :
                    members.map((member) => {
                      const checked = selectedAssignees.some((a) => a.uid === member.uid);
                      return (
                        <button key={member.uid} type="button" onClick={() => toggleAssignee(member)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-gray-100 last:border-0 ${checked ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                            {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {(member.displayName||member.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{member.displayName}</p>
                            <p className="text-xs text-gray-400 truncate">{member.email}</p>
                          </div>
                        </button>
                      );
                    })
                  }
                </div>
                {selectedAssignees.length === 0 && <p className="text-xs text-red-500 mt-1">担当者を1人以上選択してください</p>}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreateTask(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">キャンセル</button>
                <button onClick={createTask} disabled={!taskTitle.trim() || selectedAssignees.length === 0} className="flex-1 bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2.5 rounded-lg text-sm font-medium">追加</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
