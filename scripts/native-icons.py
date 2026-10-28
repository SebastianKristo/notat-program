#!/usr/bin/env python3
"""Legger inn de tre appikonene (Ark, Krystall, Marg) som alternative ikoner i de genererte
Capacitor-prosjektene, slik at @capacitor-community/app-icon kan bytte ikon på hjemskjermen.
Bruk: python3 scripts/native-icons.py android|ios"""
import json, os, re, shutil, sys

ICONS = ['Ark', 'Krystall', 'Marg']
DEFAULT = 'Krystall'
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def android():
    res = os.path.join(root, 'android/app/src/main/res/drawable')
    os.makedirs(res, exist_ok=True)
    for n in ICONS:
        shutil.copy(os.path.join(root, 'assets/icons/android', n.lower() + '.png'), os.path.join(res, f'appicon_{n.lower()}.png'))
    mf = os.path.join(root, 'android/app/src/main/AndroidManifest.xml')
    s = open(mf).read()
    if 'activity-alias' in s:
        return
    # Hovedaktiviteten skal ikke lenger stå i oppstarteren; det gjør aliasene
    s = s.replace('<category android:name="android.intent.category.LAUNCHER" />', '', 1)
    aliases = ''.join(f'''
        <activity-alias android:name=".{n}" android:label="@string/app_name" android:icon="@drawable/appicon_{n.lower()}"
            android:roundIcon="@drawable/appicon_{n.lower()}" android:enabled="{'true' if n == DEFAULT else 'false'}"
            android:exported="true" android:targetActivity=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>''' for n in ICONS)
    s = re.sub(r'(</activity>)', r'\1' + aliases, s, count=1)
    open(mf, 'w').write(s)

def ios():
    cat = os.path.join(root, 'ios/App/App/Assets.xcassets')
    for n in ICONS:
        d = os.path.join(cat, f'{n}.appiconset')
        os.makedirs(d, exist_ok=True)
        shutil.copy(os.path.join(root, 'assets/icons', n + '.png'), os.path.join(d, 'icon-1024.png'))
        json.dump({'images': [{'filename': 'icon-1024.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}],
                   'info': {'author': 'xcode', 'version': 1}}, open(os.path.join(d, 'Contents.json'), 'w'), indent=2)

{'android': android, 'ios': ios}[sys.argv[1]]()
print('Alternative appikoner lagt inn for', sys.argv[1])
