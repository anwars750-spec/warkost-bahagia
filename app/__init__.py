import os
from flask import Flask
from .db import init_db
from .routes import bp

def create_app():
    app=Flask(__name__,instance_relative_config=True)
    app.config['SECRET_KEY']=os.environ.get('WARKOST_SECRET_KEY','local-dev-change-me')
    app.config['DATABASE']=os.environ.get('WARKOST_DATABASE', app.instance_path+'/warkost.db')
    app.config['MAX_CONTENT_LENGTH']=5*1024*1024
    init_db(app)
    app.register_blueprint(bp)
    return app
