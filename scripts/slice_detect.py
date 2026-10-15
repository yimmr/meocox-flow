"""
MeocoxFlow AI - 视频镜头智能切片与特征提取脚本
支持基于 FFmpeg 关键帧/场景突变检测，输出带时间戳的高光片段与缩略图
"""

import sys
import os
import argparse
import subprocess
import json
import re

def run_command(cmd):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
    if result.returncode != 0:
        print(f"Error running command: {cmd}\nStderr: {result.stderr}", file=sys.stderr)
    return result

def get_video_info(video_path):
    cmd = f'ffprobe -v quiet -print_format json -show_format -show_streams "{video_path}"'
    res = run_command(cmd)
    try:
        data = json.loads(res.stdout)
        duration = float(data.get("format", {}).get("duration", 0))
        return duration
    except Exception as e:
        print(f"Failed to probe video: {e}")
        return 0

def detect_scenes_ffmpeg(video_path, threshold=0.35):
    """
    Use ffmpeg scene detection filter to find cut points
    """
    cmd = f'ffmpeg -i "{video_path}" -filter_complex "select=\'gt(scene,{threshold})\',metadata=print:file=-" -f null -'
    res = run_command(cmd)
    
    pts_times = []
    for line in res.stdout.splitlines():
        match = re.search(r'pts_time:([0-9.]+)', line)
        if match:
            t = float(match.group(1))
            if not pts_times or (t - pts_times[-1] >= 2.0): # Minimum 2 seconds per scene
                pts_times.append(t)
    return pts_times

def main():
    parser = argparse.ArgumentParser(description="Auto scene slice using FFmpeg")
    parser.add_argument("--input", required=True, help="Input video file path")
    parser.add_argument("--output_dir", required=True, help="Output directory for cut clips")
    parser.add_argument("--threshold", type=float, default=0.35, help="Scene change threshold (0.1 - 0.5)")
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    output_dir = os.path.abspath(args.output_dir)
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(input_path):
        print(f"File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    total_duration = get_video_info(input_path)
    print(f"Probing video: {input_path}, Total Duration: {total_duration:.2f}s")

    scenes = detect_scenes_ffmpeg(input_path, args.threshold)
    print(f"Detected {len(scenes)} scene transitions.")

    # Slice clips
    points = [0.0] + scenes + ([total_duration] if total_duration > 0 else [])
    points = sorted(list(set(points)))

    sliced_clips = []
    for i in range(len(points) - 1):
        start = points[i]
        end = points[i+1]
        dur = end - start
        if dur < 1.5:  # skip too short
            continue

        clip_name = f"clip_{i+1:03d}_{int(start)}s_to_{int(end)}s.mp4"
        clip_path = os.path.join(output_dir, clip_name)
        thumb_path = os.path.join(output_dir, f"thumb_{i+1:03d}.jpg")

        # Fast cut
        slice_cmd = f'ffmpeg -y -ss {start:.2f} -i "{input_path}" -t {dur:.2f} -c copy "{clip_path}"'
        run_command(slice_cmd)

        # Generate thumbnail
        thumb_cmd = f'ffmpeg -y -ss {start + 0.5:.2f} -i "{input_path}" -vframes 1 -q:v 2 "{thumb_path}"'
        run_command(thumb_cmd)

        sliced_clips.append({
            "id": f"clip_{i+1:03d}",
            "name": clip_name,
            "path": clip_path,
            "thumbnail": thumb_path,
            "start": start,
            "end": end,
            "duration": dur
        })
        print(f"Generated clip {i+1}: {clip_name} ({dur:.2f}s)")

    output_manifest = os.path.join(output_dir, "manifest.json")
    with open(output_manifest, "w", encoding="utf-8") as f:
        json.dump(sliced_clips, f, ensure_ascii=False, indent=2)

    print(f"Scene slicing complete! {len(sliced_clips)} clips saved to {output_dir}")

if __name__ == "__main__":
    main()
