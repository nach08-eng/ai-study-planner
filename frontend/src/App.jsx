import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const emptyForm = {
  title: "",
  description: "",
  email: "",
  scheduledAt: ""
};

function App() {
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("google_id_token") || "");
  const [user, setUser] = useState(() =>
    parseJwt(localStorage.getItem("google_id_token") || "")
  );
  const [socketConnected, setSocketConnected] = useState(false);
  const googleButtonRef = useRef(null);
  const hasGoogleClientId =
    Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID) &&
    import.meta.env.VITE_GOOGLE_CLIENT_ID !== "your_google_oauth_client_id";

  const authHeaders = useMemo(
    () => ({
      headers: {
        Authorization: `Bearer ${token}`
      }
    }),
    [token]
  );

  const loadTasks = async () => {
    const { data } = await axios.get(`${API_BASE}/tasks`, authHeaders);
    setTasks(data);
  };

  const loadNotifications = async () => {
    const { data } = await axios.get(`${API_BASE}/notifications`, authHeaders);
    setNotifications(data);
  };

  useEffect(() => {
    if (!token) {
      setTasks([]);
      setNotifications([]);
      return;
    }

    loadTasks().catch((err) =>
      setError(err.response?.data?.message || "Failed to load tasks.")
    );
    loadNotifications().catch((err) =>
      setError(err.response?.data?.message || "Failed to load notifications.")
    );
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = io(API_BASE, {
      auth: {
        token
      }
    });

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", (err) => {
      setError(err?.message || "Socket.IO connection failed.");
    });
    socket.on("task:emailSent", ({ task, notification }) => {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t)));
      setNotifications((prev) => [notification, ...prev]);
    });

    return () => {
      socket.disconnect();
      setSocketConnected(false);
    };
  }, [token]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!hasGoogleClientId || !clientId || !googleButtonRef.current) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google || !googleButtonRef.current) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (!response?.credential) {
            setError("Google sign-in failed: no credential returned.");
            return;
          }
          localStorage.setItem("google_id_token", response.credential);
          setToken(response.credential);
          setUser(parseJwt(response.credential));
          setError("");
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 260
      });
    };
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [hasGoogleClientId]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingTaskId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...formData,
        scheduledAt: new Date(formData.scheduledAt).toISOString()
      };

      if (editingTaskId) {
        await axios.put(`${API_BASE}/tasks/${editingTaskId}`, payload, authHeaders);
      } else {
        await axios.post(`${API_BASE}/tasks`, payload, authHeaders);
      }

      resetForm();
      await loadTasks();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save task.");
    }
  };

  const handleEdit = (task) => {
    setEditingTaskId(task._id);
    setFormData({
      title: task.title,
      description: task.description,
      email: task.email,
      scheduledAt: toInputDateTime(task.scheduledAt)
    });
  };

  const handleDelete = async (id) => {
    setError("");
    try {
      await axios.delete(`${API_BASE}/tasks/${id}`, authHeaders);
      await loadTasks();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete task.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("google_id_token");
    setToken("");
    setUser(null);
    setEditingTaskId(null);
    setFormData(emptyForm);
  };

  const handleLocalLogin = () => {
    const localToken = "dev-local-token";
    localStorage.setItem("google_id_token", localToken);
    setToken(localToken);
    setUser({ name: "Local Dev User", email: "local@example.com" });
    setError("");
  };

  const notificationFeed = useMemo(() => {
    const pendingItems = tasks
      .filter((task) => task.status === "pending")
      .map((task) => ({
        _id: `pending-${task._id}`,
        message: `Pending scheduled email: ${task.title} (${task.email})`,
        createdAt: task.scheduledAt,
        type: "pending"
      }));

    const sentItems = notifications.map((n) => ({
      ...n,
      type: "sent"
    }));

    return [...pendingItems, ...sentItems].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }, [tasks, notifications]);

  return (
    <div className="container">
      <h1>To-Do Reminder App</h1>
      <section className="card auth-card">
        {!token ? (
          <>
            <h2>Sign in with Google</h2>
            <p className="muted">
              Login to access only your scheduled tasks and notifications.
            </p>
            {hasGoogleClientId ? (
              <div ref={googleButtonRef} />
            ) : (
              <>
                <p className="muted">
                  Google OAuth key not configured. Use local login for development.
                </p>
                <button onClick={handleLocalLogin}>Continue with Local Dev Login</button>
              </>
            )}
          </>
        ) : (
          <div className="auth-row">
            <div>
              <strong>{user?.name || user?.email || "Google user"}</strong>
              <p className="muted">
                {user?.email || "Signed in"} | Socket:{" "}
                {socketConnected ? "connected" : "connecting..."}
              </p>
            </div>
            <button className="secondary" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </section>
      {token && (
      <div className="layout">
        <section className="card">
          <h2>{editingTaskId ? "Edit Task" : "Create Task"}</h2>
          <form className="task-form" onSubmit={handleSubmit}>
            <input
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Task title"
              required
            />
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Task description"
              required
            />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email address"
              required
            />
            <input
              type="datetime-local"
              name="scheduledAt"
              value={formData.scheduledAt}
              onChange={handleChange}
              required
            />
            <div className="row">
              <button type="submit">{editingTaskId ? "Update Task" : "Add Task"}</button>
              {editingTaskId && (
                <button type="button" className="secondary" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="card">
          <h2>Task List</h2>
          <div className="list">
            {tasks.length === 0 && <p className="muted">No tasks yet.</p>}
            {tasks.map((task) => (
              <article key={task._id} className="task-item">
                <div className="row">
                  <h3>{task.title}</h3>
                  <span className={`status ${task.status}`}>{task.status}</span>
                </div>
                <p>{task.description}</p>
                <p>
                  <strong>Email:</strong> {task.email}
                </p>
                <p>
                  <strong>Scheduled:</strong> {new Date(task.scheduledAt).toLocaleString()}
                </p>
                <div className="row">
                  <button onClick={() => handleEdit(task)}>Edit</button>
                  <button className="danger" onClick={() => handleDelete(task._id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Notifications</h2>
          <div className="list">
            {notificationFeed.length === 0 && (
              <p className="muted">No notifications yet.</p>
            )}
            {notificationFeed.map((n) => (
              <article key={n._id} className={`notification-item ${n.type}`}>
                <p>{n.message}</p>
                <small>{new Date(n.createdAt).toLocaleString()}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
      )}
    </div>
  );
}

function toInputDateTime(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseJwt(token) {
  try {
    if (!token) {
      return null;
    }
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch (_error) {
    return null;
  }
}

export default App;
