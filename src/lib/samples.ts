import type { CodeFile } from "@/types";

export const SAMPLE_PROJECTS: { name: string; files: CodeFile[] }[] = [
  {
    name: "FastAPI + SQLAlchemy",
    files: [
      {
        filename: "frontend.tsx",
        path: "frontend/src/components/UserList.tsx",
        language: "tsx",
        content: `import { useState, useEffect } from "react";

export default function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch("/api/users", { method: "GET" })
      .then((res) => res.json())
      .then((data) => setUsers(data));
  }, []);

  const addUser = (name: string) => {
    fetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  };

  const deleteUser = (id: number) => {
    fetch(\`/api/users/\${id}\`, { method: "DELETE" });
  };

  return <div>{users.length} users</div>;
}
`,
      },
      {
        filename: "main.py",
        path: "backend/app/main.py",
        language: "python",
        content: `from fastapi import FastAPI, HTTPException
from sqlalchemy.orm import Session
from database import get_db, User

app = FastAPI()

@app.get("/api/users")
async def list_users(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.active == True).all()
    return users

@app.post("/api/users")
async def create_user(name: str, db: Session = Depends(get_db)):
    user = User(name=name)
    db.add(user)
    db.commit()
    return {"id": user.id}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404)
    db.delete(user)
    db.commit()
    return {"ok": True}
`,
      },
      {
        filename: "database.py",
        path: "backend/app/database.py",
        language: "python",
        content: `from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import sessionmaker, declarative_base

engine = create_engine("sqlite:///app.db")
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    active = Column(Boolean, default=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
`,
      },
    ],
  },
  {
    name: "Express + Prisma",
    files: [
      {
        filename: "App.jsx",
        path: "client/src/App.jsx",
        language: "jsx",
        content: `import { useState, useEffect } from "react";

export default function Products() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then(setProducts);
  }, []);

  const create = () => {
    axios.post("/api/products", { name: "New Item", price: 99 });
  };

  const remove = (id) => {
    axios.delete(\`/api/products/\${id}\`);
  };

  return <div>{products.length} products</div>;
}
`,
      },
      {
        filename: "server.js",
        path: "server/src/server.js",
        language: "javascript",
        content: `import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

app.get("/api/products", async (req, res) => {
  const items = await prisma.product.findMany();
  res.json(items);
});

app.post("/api/products", async (req, res) => {
  const product = await prisma.product.create({
    data: req.body
  });
  res.json(product);
});

app.delete("/api/products/:id", async (req, res) => {
  await prisma.product.delete({
    where: { id: Number(req.params.id) }
  });
  res.json({ ok: true });
});

app.listen(3000);
`,
      },
    ],
  },
  {
    name: "Flask + SQLite",
    files: [
      {
        filename: "app.py",
        path: "app.py",
        language: "python",
        content: `from flask import Flask, request, jsonify
import sqlite3

app = Flask(__name__)

@app.get("/api/tasks")
def get_tasks():
    conn = sqlite3.connect("tasks.db")
    rows = conn.execute("SELECT * FROM tasks").fetchall()
    return jsonify(rows)

@app.post("/api/tasks")
def create_task():
    title = request.json["title"]
    conn = sqlite3.connect("tasks.db")
    conn.execute("INSERT INTO tasks (title) VALUES (?)", (title,))
    conn.commit()
    return jsonify({"ok": True})

@app.delete("/api/tasks/<task_id>")
def delete_task(task_id):
    conn = sqlite3.connect("tasks.db")
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    return jsonify({"ok": True})
`,
      },
      {
        filename: "client.jsx",
        path: "static/client.jsx",
        language: "jsx",
        content: `export function TaskApp() {
  const load = () => fetch("/api/tasks").then(r => r.json());
  const add = (title) => fetch("/api/tasks", { method: "POST", body: JSON.stringify({ title }) });
  const remove = (id) => fetch(\`/api/tasks/\${id}\`, { method: "DELETE" });
  return null;
}
`,
      },
    ],
  },
];
