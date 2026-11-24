# Candidate audio engine lab

Tests independent Go and Python libraries with their default configuration on a public Creative Commons test video (Big Buck Bunny). Success requires reading 4096 audio bytes, not merely finding metadata or resolving a URL. The Python probe also checks the HTTP status and media type. No cookies, tokens, proxy settings, or URLs are logged. The jobs report failure if no audio can be read. The results apply to the CI network only; a pass does not imply availability on Altare or for every track. Production audio code and Docker dependencies are unchanged.

Additional v2.7.6 jobs test NewPipeExtractor and yt-dlp. The NewPipe test uses the production Docker image, and neither job logs media URLs.
