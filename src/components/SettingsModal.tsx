"use client";

import { useState, useEffect } from "react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserSettings } from "@/types";
import { X, Bell, BellOff, Moon } from "lucide-react";

interface Props {
  userId: string;
  onClose: () => void;
}

export default function SettingsModal({ userId, onClose }: Props) {
  const [settings, setSettings] = useState<UserSettings>({
    notificationsEnabled: true,
    silentStart: "22:00",
    silentEnd: "08:00",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "userSettings", userId)).then((snap) => {
      if (snap.exists()) setSettings(snap.data() as UserSettings);
    });
  }, [userId]);

  const save = async () => {
    setSaving(true);
    await setDoc(doc(db, "userSettings", userId), settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">通知設定</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="space-y-5">
          {/* 通知のオン/オフ */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              {settings.notificationsEnabled
                ? <Bell className="w-5 h-5 text-blue-600" />
                : <BellOff className="w-5 h-5 text-gray-400" />}
              <div>
                <p className="text-sm font-medium text-gray-900">プッシュ通知</p>
                <p className="text-xs text-gray-500">メッセージ・タスク割り当て時に通知</p>
              </div>
            </div>
            <button
              onClick={() => setSettings((p) => ({ ...p, notificationsEnabled: !p.notificationsEnabled }))}
              className={`relative w-12 h-6 rounded-full transition-colors ${settings.notificationsEnabled ? "bg-blue-600" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.notificationsEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* サイレント時間帯 */}
          <div className={`p-4 bg-gray-50 rounded-xl ${!settings.notificationsEnabled ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="flex items-center gap-2 mb-3">
              <Moon className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-medium text-gray-900">サイレント時間帯</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">この時間帯は通知を受け取りません</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">開始</label>
                <input
                  type="time"
                  value={settings.silentStart}
                  onChange={(e) => setSettings((p) => ({ ...p, silentStart: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-gray-400 mt-5">〜</span>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">終了</label>
                <input
                  type="time"
                  value={settings.silentEnd}
                  onChange={(e) => setSettings((p) => ({ ...p, silentEnd: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium disabled:bg-blue-400">
            {saved ? "保存しました ✓" : saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
