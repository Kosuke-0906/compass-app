from PIL import Image

# Open the 2048x1564 screenshot
img = Image.open('/Users/katokosuke/.gemini/antigravity/brain/e2ba4ba8-e091-4544-b1bb-e5ea9a270f58/crystal_perfect_icon_1775226235347.png')
width, height = img.size

# The icon is centered horizontally and top-ish.
# Let's find a tighter crop. 
# 1200px square will make the icon look significantly larger as requested.
crop_size = 1300 
left = (width - crop_size) // 2
top = (height - crop_size) // 2 # Centered perfectly vertically
right = left + crop_size
bottom = top + crop_size

cropped = img.crop((left, top, right, bottom))
cropped.save('/Users/katokosuke/Desktop/my_app/public/icon.png')
cropped.resize((192, 192)).save('/Users/katokosuke/Desktop/my_app/public/icon-192.png')
cropped.resize((512, 512)).save('/Users/katokosuke/Desktop/my_app/public/icon-512.png')
cropped.save('/Users/katokosuke/Desktop/my_app/public/apple-icon.png')
cropped.resize((32, 32)).save('/Users/katokosuke/Desktop/my_app/public/favicon.ico')
