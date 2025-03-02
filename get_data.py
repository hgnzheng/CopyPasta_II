import requests

labs = requests.get('https://api.vitaldb.net/labs')
cases = requests.get('https://api.vitaldb.net/cases')
tracks = requests.get('https://api.vitaldb.net/trks')

assert labs.status_code == 200
assert cases.status_code == 200
assert tracks.status_code == 200

with open('data/labs.txt', 'w') as file:
    file.write(labs.text)

with open('data/cases.txt', 'w') as file:
    file.write(cases.text)

with open('data/trks.txt', 'w') as file:
    file.write(tracks.text)