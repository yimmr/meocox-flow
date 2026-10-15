"""
MeocoxFlow AI - 剪映 Draft 命令行生成工具
读取项目分镜 (storyboard.json) 与素材库 (assets.json)，生成标准的剪映 Draft
"""

import sys
import os
import argparse
import json
import uuid
import time

def gen_uuid():
    return str(uuid.uuid4()).upper()

def to_us(seconds):
    return int(float(seconds) * 1000000)

def main():
    parser = argparse.ArgumentParser(description="Generate Jianying Draft from Storyboard")
    parser.add_argument("--storyboard", required=True, help="Path to storyboard.json")
    parser.add_argument("--assets", required=True, help="Path to assets.json")
    parser.add_argument("--output_dir", required=True, help="Target draft directory")
    parser.add_argument("--name", default="MeocoxFlow_Draft", help="Draft project name")
    args = parser.parse_args()

    with open(args.storyboard, "r", encoding="utf-8") as f:
        storyboard = json.load(f)

    with open(args.assets, "r", encoding="utf-8") as f:
        assets = json.load(f)

    os.makedirs(args.output_dir, exist_ok=True)
    asset_map = {a.get("id"): a for a in assets}

    now = int(time.time())
    now_us = int(time.time() * 1000000)
    draft_id = gen_uuid()

    current_cursor_us = 0
    video_materials = []
    speed_materials = []
    canvas_materials = []
    text_materials = []
    video_segments = []
    text_segments = []
    meta_materials = []

    for i, item in enumerate(storyboard):
        clip_id = item.get("matchedClipId")
        asset = asset_map.get(clip_id, assets[i % len(assets)] if assets else {})
        dur_sec = float(item.get("durationSec") or asset.get("durationSec") or 4.0)
        dur_us = to_us(dur_sec)
        start_us = current_cursor_us

        vid_id = gen_uuid()
        speed_id = gen_uuid()
        canvas_id = gen_uuid()

        v_path = asset.get("localPath") or f"clip_{i+1}.mp4"
        v_name = asset.get("name") or f"clip_{i+1}.mp4"

        video_materials.append({
            "category_id": "", "category_name": "local", "check_flag": 63487,
            "duration": dur_us, "has_audio": True, "height": 1080, "width": 1920,
            "id": vid_id, "material_name": v_name, "path": v_path, "type": "video"
        })
        speed_materials.append({"id": speed_id, "mode": 0, "speed": 1.0, "type": "speed"})
        canvas_materials.append({"id": canvas_id, "type": "canvas_color", "color": ""})

        video_segments.append({
            "id": gen_uuid(), "material_id": vid_id,
            "extra_material_refs": [speed_id, canvas_id],
            "source_timerange": {"duration": dur_us, "start": 0},
            "target_timerange": {"duration": dur_us, "start": start_us},
            "speed": 1.0, "volume": 1.0
        })

        meta_materials.append({
            "create_time": now, "duration": dur_us, "extra_info": "", "file_Path": v_path,
            "height": 1080, "width": 1920, "id": vid_id, "import_time": now,
            "import_time_us": now_us, "item_source": 1, "metetype": "video",
            "roughcut_time_range": {"duration": 0, "start": 0},
            "sub_time_range": {"duration": -1, "start": -1}, "type": 0
        })

        script_text = item.get("scriptText")
        if script_text:
            text_id = gen_uuid()
            text_materials.append({
                "content": json.dumps({"styles": [{"range": [0, len(script_text)], "size": 9.0}], "text": script_text}),
                "id": text_id, "types": 0
            })
            text_segments.append({
                "id": gen_uuid(), "material_id": text_id,
                "target_timerange": {"duration": dur_us, "start": start_us},
                "clip": {"transform": {"x": 0.0, "y": -0.75}}
            })

        current_cursor_us += dur_us

    draft_content = {
        "canvas_config": {"height": 1080, "ratio": "original", "width": 1920},
        "duration": current_cursor_us, "fps": 30.0, "id": draft_id,
        "materials": {
            "canvases": canvas_materials, "speeds": speed_materials,
            "texts": text_materials, "videos": video_materials
        },
        "name": args.name,
        "tracks": [
            {"id": gen_uuid(), "type": "video", "segments": video_segments},
            {"id": gen_uuid(), "type": "text", "segments": text_segments}
        ],
        "version": 360000
    }

    draft_meta = {
        "draft_fold_path": args.output_dir, "draft_id": draft_id,
        "draft_is_invisible": False,
        "draft_materials": [{"type": 0, "value": meta_materials}],
        "draft_name": args.name,
        "draft_root_path": os.path.dirname(args.output_dir),
        "tm_draft_create": now_us, "tm_draft_modified": now_us,
        "tm_duration": current_cursor_us
    }

    with open(os.path.join(args.output_dir, "draft_content.json"), "w", encoding="utf-8") as f:
        json.dump(draft_content, f, ensure_ascii=False, indent=2)

    with open(os.path.join(args.output_dir, "draft_meta_info.json"), "w", encoding="utf-8") as f:
        json.dump(draft_meta, f, ensure_ascii=False, indent=2)

    print(f"Jianying Draft generated successfully in: {args.output_dir}")

if __name__ == "__main__":
    main()
