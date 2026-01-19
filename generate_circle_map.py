#!/usr/bin/env python3
"""
Generate circular map binary files for OpenFront
Uses the same terrain packing as the Go map generator
"""
import struct
import math
import os

def is_land(x, y, center_x, center_y, radius):
    """Check if a point is land (inside the circle)"""
    distance = math.sqrt((x - center_x)**2 + (y - center_y)**2)
    return distance <= radius

def generate_map(width, height, output_file):
    """Generate a circular map with proper terrain encoding"""
    center_x = width / 2
    center_y = height / 2
    radius = min(width, height) * 0.44  # 44% of size for nice circular land
    
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
            distance = math.sqrt((x - center_x)**2 + (y - center_y)**2)
            
            if distance <= radius:
                # Land - add magnitude based on distance from edge
                magnitude = min(31, int((radius - distance) / radius * 20))
                terrain.append(LAND_BASE | magnitude)
                land_count += 1
            else:
                # Ocean - add magnitude based on distance from land
                magnitude = min(31, int((distance - radius) / 100 * 20))
                terrain.append(OCEAN_BASE | magnitude)
    
    # Write binary file (NO dimension headers - just raw terrain data)
    with open(output_file, 'wb') as f:
        f.write(bytes(terrain))
    
    print(f"Generated {output_file}: {width}x{height}, {land_count} land tiles")
    return land_count

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
    radius = min(target_width, target_height) * 0.44
    
    # Create image
    img = Image.new('RGB', (target_width, target_height), (0, 0, 0))
    pixels = img.load()
    
    for y in range(target_height):
        for x in range(target_width):
            distance = math.sqrt((x - center_x)**2 + (y - center_y)**2)
            
            if distance <= radius:
                # Land - use green/tan colors like map_generator.go
                # Calculate magnitude based on distance from edge
                magnitude = min(31, int((radius - distance) / radius * 20))
                
                if distance > radius - 2:
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
                if distance < radius + 3:
                    # Shoreline water
                    pixels[x, y] = (100, 143, 255)
                else:
                    # Ocean - darker with distance
                    magnitude = min(10, int((distance - radius) / 20))
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
output_dir = 'resources/maps/circlemap'
os.makedirs(output_dir, exist_ok=True)

# Generate all three map sizes
land_tiles_full = generate_map(800, 800, f'{output_dir}/map.bin')
land_tiles_4x = generate_map(400, 400, f'{output_dir}/map4x.bin')
land_tiles_16x = generate_map(200, 200, f'{output_dir}/map16x.bin')

# Generate thumbnail (scaled from 4x map with proper colors)
generate_thumbnail(800, 800, f'{output_dir}/thumbnail.webp')

print(f"\nLand tile counts:")
print(f"  Full (800x800): {land_tiles_full}")
print(f"  4x (400x400): {land_tiles_4x}")
print(f"  16x (200x200): {land_tiles_16x}")
print("\nUpdate these values in manifest.json")
