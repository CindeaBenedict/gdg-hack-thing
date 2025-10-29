import os
os.environ["FIREBASE_SERVICE_ACCOUNT"] = "{\"type\":\"service_account\",\"project_id\":\"dummy-project\",\"private_key_id\":\"dummy\",\"private_key\":\"-----BEGIN PRIVATE KEY-----\\nMII...dummy...\\n-----END PRIVATE KEY-----\\n\",\"client_email\":\"dummy@dummy.iam.gserviceaccount.com\",\"client_id\":\"123\",\"auth_uri\":\"https://accounts.google.com/o/oauth2/auth\",\"token_uri\":\"https://oauth2.googleapis.com/token\",\"auth_provider_x509_cert_url\":\"https://www.googleapis.com/oauth2/v1/certs\",\"client_x509_cert_url\":\"https://www.googleapis.com/robot/v1/metadata/x509/dummy%40dummy.iam.gserviceaccount.com\"}"
import importlib
m = importlib.import_module("backend.main")
print("import ok")
