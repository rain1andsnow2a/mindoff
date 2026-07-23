"""SQLAlchemy 引擎 / 会话 / 声明基类。

同步引擎 + SQLite（黑客松），FastAPI 通过 get_db 依赖注入获取 session。
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

_settings = get_settings()

engine = create_engine(
    _settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite 多线程安全
    echo=False,
)


# SQLite 启用 WAL + 外键约束
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI 依赖：yield 一个 session，请求结束自动关闭。"""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
