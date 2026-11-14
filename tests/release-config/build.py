"""Separate opt-in release-config build-only entry; no device or artifact transfer."""
import argparse,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('image_receipt',Path(__file__).resolve().parents[1]/'apk-images/build-receipt.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('destination',type=Path);p.add_argument('--result',required=True,type=Path);a=p.parse_args()
 raise SystemExit(m.main(a.destination,a.result,mode='release_config'))
