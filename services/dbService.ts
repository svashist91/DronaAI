const API_URL = 'http://localhost:3001/api';

export const dbService = {
  async getSessions(userId: string) {
    const res = await fetch(`${API_URL}/sessions?userId=${userId}`);
    return res.json();
  },

  async saveSession(session: any, userId: string) {
    await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        userId,
        title: session.title,
        createdAt: session.createdAt
      })
    });
  },

  async saveMessage(message: any, sessionId: string) {
    await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: message.id,
        sessionId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp
      })
    });
  },

  async deleteSession(sessionId: string) {
    await fetch(`${API_URL}/sessions/${sessionId}`, { method: 'DELETE' });
  }
};