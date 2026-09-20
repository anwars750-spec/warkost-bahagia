import os
from flask import Flask
from .db import init_db
from .routes import bp

def create_app():
    app=Flask(__name__,instance_relative_config=True)
    app.config['SECRET_KEY']=os.environ.get('WARKOST_SECRET_KEY','local-dev-change-me')
    app.config['DATABASE']=app.instance_path+'/warkost.db'
    app.config['MAX_CONTENT_LENGTH']=5*1024*1024
    # V1.7B: keep SQLite as the default so Customer V1.6 remains unchanged.
    # Supabase becomes active only when explicitly enabled in the server environment.
    app.config['WARKOST_BACKEND']=os.environ.get('WARKOST_BACKEND','sqlite').strip().lower()
    app.config['SUPABASE_URL']=os.environ.get('SUPABASE_URL','').strip()
    app.config['SUPABASE_SERVICE_ROLE_KEY']=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','').strip()
    init_db(app)
    app.register_blueprint(bp)
    return app
