export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: Date;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  createdBy: string;
  createdAt: Date;
  iconColor: string;
}

export interface Message {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: Date;
  likes: string[]; // array of uids
}

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Assignee {
  uid: string;
  name: string;
}

export interface Task {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: Assignee[];
  createdBy: string;
  createdAt: Date;
  dueDate?: Date;
}
