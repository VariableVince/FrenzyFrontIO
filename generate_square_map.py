#!/usr/bin/env python3
"""
Generate square map binary files for OpenFront Frenzy mode
Uses the same terrain packing as the Go map generator

Features:
- Square land mass with water border
- Crystal density increases toward center
- Spawn prohibition zone defined in center (smaller square)
"""
import struct
import math
import json
import os

def generate_map(width, height, output_file):
    """Generate a square map with proper terrain encoding"""
    center_x = width / 2
    center_y = height / 2
    
    # Square land extends to 40% from center (with wider water border)
    land_half_size = min(width, height) * 0.40
    
    # Crystal zone: only center <10% of map gets high magnitude
    crystal_zone_size = min(width, height) * 0.10
    
    # Terrain encoding (from map_generator.go packTerrain function):
    # Bit 7: Is Land (1) or Water (0)
    # Bit 6: Is Shoreline
    # Bit 5: Is Ocean
    # Bits 0-4: Magnitude (0-31)
    
    LAND_BASE = 0b10000000  # 128
    OCEAN_BASE = 0b00100000  # 32
    
    # Create terrain data
    terrain = []
    land_count = 0
    
    for y in range(height):
        for x in range(width):
            # Calculate distance from center using Chebyshev distance (max of x,y distances)
            # This creates a square shape
            dx = abs(x - center_x)
            dy = abs(y - center_y)
            chebyshev_distance = max(dx, dy)
            
            if chebyshev_distance <= land_half_size:
                # Land - only center <10% gets high magnitude for crystals
                if chebyshev_distance <= crystal_zone_size:
                    # Inside crystal zone - high magnitude
                    # Normalize: 0 at edge of crystal zone, 1 at center
                    normalized_dist = 1 - (chebyshev_distance / crystal_zone_size)
                    magnitude = min(31, int(normalized_dist * 25) + 6)  # 6-31 in crystal zone
                else:
                    # Outside crystal zone - low/no magnitude (no crystals)
                    magnitude = 0
                terrain.append(LAND_BASE | magnitude)
                land_count += 1
            else:
                # Ocean - magnitude based on distance from land
                distance_from_land = chebyshev_distance - land_half_size
                magnitude = min(31, int(distance_from_land / 50 * 20))
                terrain.append(OCEAN_BASE | magnitude)
    
    # Write binary file (NO dimension headers - just raw terrain data)
    with open(output_file, 'wb') as f:
        f.write(bytes(terrain))
    
    print(f"Generated {output_file}: {width}x{height}, {land_count} land tiles")
    return land_count

def create_manifest(land_tiles_full, land_tiles_4x, land_tiles_16x):
    """Create the manifest.json file for the square map"""
    manifest = {
        "name": "Square Map",
        "map": {
            "width": 800,
            "height": 800,
            "num_land_tiles": land_tiles_full
        },
        "map4x": {
            "width": 400,
            "height": 400,
            "num_land_tiles": land_tiles_4x
        },
        "map16x": {
            "width": 200,
            "height": 200,
            "num_land_tiles": land_tiles_16x
        },
        "nations": [
            {
                "coordinates": [400, 100],
                "flag": "",
                "name": "Northland",
                "strength": 2
            },
            {
                "coordinates": [700, 400],
                "flag": "",
                "name": "Eastland",
                "strength": 2
            },
            {
                "coordinates": [400, 700],
                "flag": "",
                "name": "Southland",
                "strength": 2
            },
            {
                "coordinates": [100, 400],
                "flag": "",
                "name": "Westland",
                "strength": 2
            }
        ]
    }
    return manifest

def generate_thumbnail(map_width, map_height, output_file, quality=0.5):
    """Generate a thumbnail with proper terrain colors like the Go map generator"""
    try:
        from PIL import Image
    except ImportError:
        print("Warning: PIL not installed, cannot generate thumbnail")
        print("Install with: pip install Pillow")
        return False
    
    # Use 4x map size scaled by quality (same as Go generator)
    src_width = map_width // 2  # 4x map
    src_height = map_height // 2
    
    target_width = max(1, int(src_width * quality))
    target_height = max(1, int(src_height * quality))
    
    center_x = target_width / 2
    center_y = target_height / 2
    land_half_size = min(target_width, target_height) * 0.40
    
    # Create image
    img = Image.new('RGB', (target_width, target_height), (0, 0, 0))
    pixels = img.load()
    
    for y in range(target_height):
        for x in range(target_width):
            dx = abs(x - center_x)
            dy = abs(y - center_y)
            chebyshev_distance = max(dx, dy)
            
            if chebyshev_distance <= land_half_size:
                # Land - use green/tan colors like map_generator.go
                distance_from_edge = land_half_size - chebyshev_distance
                magnitude = min(31, int(distance_from_edge / land_half_size * 20))
                
                if chebyshev_distance > land_half_size - 2:
                    # Shoreline land
                    pixels[x, y] = (204, 203, 158)
                elif magnitude < 10:
                    # Plains
                    adj = int(220 - 2 * magnitude)
                    pixels[x, y] = (190, adj, 138)
                else:
                    # Highlands
                    adj = int(2 * magnitude)
                    pixels[x, y] = (180 + adj // 4, 200 - adj, 130)
            else:
                # Water
                if chebyshev_distance < land_half_size + 3:
                    # Shoreline water
                    pixels[x, y] = (100, 143, 255)
                else:
                    # Ocean - darker with distance
                    magnitude = min(10, int((chebyshev_distance - land_half_size) / 20))
                    adj = 11 - magnitude - 10
                    r = max(0, 70 + adj)
                    g = max(0, 132 + adj)
                    b = max(0, 180 + adj)
                    pixels[x, y] = (r, g, b)
    
    # Save as WebP
    img.save(output_file, 'WEBP', quality=90)
    print(f"Generated thumbnail: {output_file} ({target_width}x{target_height})")
    return True

# Create output directory
output_dir = 'resources/maps/squaremap'
os.makedirs(output_dir, exist_ok=True)

# Generate all three map sizes
land_tiles_full = generate_map(800, 800, f'{output_dir}/map.bin')
land_tiles_4x = generate_map(400, 400, f'{output_dir}/map4x.bin')
land_tiles_16x = generate_map(200, 200, f'{output_dir}/map16x.bin')

# Create and save manifest
manifest = create_manifest(land_tiles_full, land_tiles_4x, land_tiles_16x)
with open(f'{output_dir}/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)

# Generate thumbnail (scaled from 4x map with proper colors)
generate_thumbnail(800, 800, f'{output_dir}/thumbnail.webp')

print(f"\nLand tile counts:")
print(f"  Full (800x800): {land_tiles_full}")
print(f"  4x (400x400): {land_tiles_4x}")
print(f"  16x (200x200): {land_tiles_16x}")
print(f"\nManifest created at {output_dir}/manifest.json")
