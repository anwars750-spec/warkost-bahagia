import os
# V0.8.6.1 offline test package: explicitly enable simulator mode.
# Remove/disable this flag for production deployment.
os.environ.setdefault('WARKOST_LOCAL_TEST_MODE', '1')
from app import create_app
app = create_app()
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
