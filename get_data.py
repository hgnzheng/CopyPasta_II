import requests
import os

os.makedirs("data", exist_ok=True)

labs = requests.get('https://api.vitaldb.net/labs')
cases = requests.get('https://api.vitaldb.net/cases')
tracks = requests.get('https://api.vitaldb.net/trks')

assert labs.status_code == 200
assert cases.status_code == 200
assert tracks.status_code == 200

def clean_text(text):
    return "\n".join([line.strip() for line in text.splitlines() if line.strip()])

with open('data/labs.txt', 'w', encoding="utf-8") as file:
    file.write(clean_text(labs.text))

with open('data/cases.txt', 'w', encoding="utf-8") as file:
    file.write(clean_text(cases.text))

with open('data/trks.txt', 'w', encoding="utf-8") as file:
    file.write(clean_text(tracks.text))
