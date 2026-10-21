import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const STATUSES = ["Pending", "Enrolled", "Completed", "Cancelled"];

function getToken() {
  return localStorage.getItem("enrollsmart_token") || "";
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

const EMPTY_FORM = {
  name: "",
  dept: "",
  level: "",
  phone: "",
  email: "",
  date: "",
  time: "",
};

export default function StudentsTable() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [timeSlots, setTimeSlots] = useState([]);
  const [dates, setDates] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addError, setAddError] = useState("");


  const [editID, setEditID] = useState("");
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editStatus, setEditStatus] = useState("Pending");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState("");


  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ pageSize: "200" });
        if (search.trim()) params.set("q", search.trim());
        if (statusFilter) params.set("status", statusFilter);
        const data = await api(`/api/students?${params}`);
        setStudents(data.students);
        setTotal(data.total);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);


  useEffect(() => {
    api("/api/enrollment-info")
      .then((data) => {
        setTimeSlots(data.timeSlots || []);
        setDates(data.dates || []);
      })
      .catch(() => {});
  }, []);


  function openAddModal() {
    setAddForm(EMPTY_FORM);
    setAddError("");
    setIsAddOpen(true);
  }

  function handleAddChange(e) {
    const { name, value } = e.target;
    setAddForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddError("");
    try {
      const data = await api("/api/students", {
        method: "POST",
        body: JSON.stringify(addForm),
      });

      setStudents((prev) => [...prev, data]);
      setTotal((n) => n + 1);
      setIsAddOpen(false);
    } catch (err) {
      setAddError(err.message);
    }
  }


  function openEditModal(student) {
    setEditID(student.id);
    setEditName(student.name || "");
    setEditDept(student.dept || "");
    setEditLevel(student.level || "");
    setEditPhone(student.phone || "");
    setEditDate(student.date || "");
    setEditTime(student.time || "");
    setEditStatus(student.status || "Pending");
    setModalError("");
    setIsModalOpen(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setModalError("");
    try {
      const data = await api(`/api/students/${editID}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName,
          dept: editDept,
          level: editLevel,
          phone: editPhone,
          date: editDate,
          time: editTime,
          status: editStatus,
        }),
      });

      setStudents((prev) => prev.map((s) => (s.id === editID ? data : s)));
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err.message);
    }
  }

  async function handleDelete(student) {
    if (!window.confirm(`Delete ${student.name} (${student.id})? Hindi na ito mababawi.`)) return;
    try {
      await api(`/api/students/${student.id}`, { method: "DELETE" });
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      setTotal((n) => n - 1);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="mb-0">Students</h1>
        <button type="button" className="btn btn-primary" onClick={openAddModal}>
          + Add Student
        </button>
      </div>

      <div className="row g-2 mb-3">
        <div className="col-md-6">
          <input
            type="text"
            className="form-control"
            placeholder="Search by name, student ID, program, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-3 d-flex align-items-center">
          <span className="text-muted">{total} student(s)</span>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <table className="table table-bordered">
        <thead className="table-dark">
          <tr>
            <th>Appointment No</th>
            <th>Student ID</th>
            <th>Name</th>
            <th>Program</th>
            <th>Level</th>
            <th>Date</th>
            <th>Time</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan="9" className="text-center">Loading...</td>
            </tr>
          )}
          {!loading && students.length === 0 && (
            <tr>
              <td colSpan="9" className="text-center">No students found.</td>
            </tr>
          )}
          {!loading &&
            students.map((s) => (
              <tr key={s.id}>
                <td>{s.appointmentNo}</td>
                <td>{s.id}</td>
                <td>{s.name}</td>
                <td>{s.dept}</td>
                <td>{s.level}</td>
                <td>{s.date}</td>
                <td>{s.time}</td>
                <td>{s.status}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm me-1"
                    onClick={() => openEditModal(s)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => handleDelete(s)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* ADD MODAL */}
      {isAddOpen && (
        <div className="modal show d-block" tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Student</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setIsAddOpen(false)}
                ></button>
              </div>
              <form onSubmit={handleAdd}>
                <div className="modal-body">
                  {addError && <div className="alert alert-danger">{addError}</div>}

                  <div className="mb-3">
                    <label htmlFor="addName" className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="addName"
                      name="name"
                      value={addForm.name}
                      onChange={handleAddChange}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="addDept" className="form-label">Program</label>
                    <input
                      type="text"
                      className="form-control"
                      id="addDept"
                      name="dept"
                      value={addForm.dept}
                      onChange={handleAddChange}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="addLevel" className="form-label">Level</label>
                    <input
                      type="text"
                      className="form-control"
                      id="addLevel"
                      name="level"
                      value={addForm.level}
                      onChange={handleAddChange}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="addPhone" className="form-label">Mobile number</label>
                    <input
                      type="text"
                      className="form-control"
                      id="addPhone"
                      name="phone"
                      placeholder="09XXXXXXXXX"
                      value={addForm.phone}
                      onChange={handleAddChange}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="addEmail" className="form-label">Email (optional)</label>
                    <input
                      type="email"
                      className="form-control"
                      id="addEmail"
                      name="email"
                      value={addForm.email}
                      onChange={handleAddChange}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="addDate" className="form-label">Enrollment date</label>
                    <select
                      className="form-select"
                      id="addDate"
                      name="date"
                      value={addForm.date}
                      onChange={handleAddChange}
                      required
                    >
                      <option value="">Select date</option>
                      {dates.map((d) => (
                        <option key={d.date} value={d.date} disabled={d.available === 0}>
                          {d.date} ({d.available} slot(s) left)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="addTime" className="form-label">Time</label>
                    <select
                      className="form-select"
                      id="addTime"
                      name="time"
                      value={addForm.time}
                      onChange={handleAddChange}
                      required
                    >
                      <option value="">Select time</option>
                      {timeSlots.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsAddOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Add Student
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isModalOpen && (
        <div className="modal show d-block" tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Student ({editID})</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setIsModalOpen(false)}
                ></button>
              </div>
              <form onSubmit={handleUpdate}>
                <div className="modal-body">
                  {modalError && <div className="alert alert-danger">{modalError}</div>}

                  <div className="mb-3">
                    <label htmlFor="editName" className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="editName"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editDept" className="form-label">Program</label>
                    <input
                      type="text"
                      className="form-control"
                      id="editDept"
                      value={editDept}
                      onChange={(e) => setEditDept(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editLevel" className="form-label">Level</label>
                    <input
                      type="text"
                      className="form-control"
                      id="editLevel"
                      value={editLevel}
                      onChange={(e) => setEditLevel(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editPhone" className="form-label">Mobile number</label>
                    <input
                      type="text"
                      className="form-control"
                      id="editPhone"
                      placeholder="09XXXXXXXXX"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editDate" className="form-label">Enrollment date</label>
                    <input
                      type="date"
                      className="form-control"
                      id="editDate"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editTime" className="form-label">Time</label>
                    <select
                      className="form-select"
                      id="editTime"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      required
                    >
                      {!timeSlots.includes(editTime) && editTime && (
                        <option value={editTime}>{editTime}</option>
                      )}
                      {timeSlots.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editStatus" className="form-label">Status</label>
                    <select
                      className="form-select"
                      id="editStatus"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}