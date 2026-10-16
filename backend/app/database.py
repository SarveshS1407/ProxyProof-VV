from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

database_url = settings.DATABASE_URL

# SQLAlchemy 2.0+ requires 'postgresql://' instead of legacy 'postgres://'
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

connect_args = {}
engine_kwargs = {"echo": False}

if database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # Production PostgreSQL connection pooling & health checks
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20,
    })

engine = create_engine(
    database_url,
    connect_args=connect_args,
    **engine_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
