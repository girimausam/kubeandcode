from flask import Flask

app = Flask(__name__)

@app.route('/')
def index():
  return 'Hello from the instance'

@app.route('/<path>')
def somePath(path):
  return 'Hello from the instance at path "{}"'.format(path)

app.run(host='0.0.0.0', port=8080)