document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const EFFECT_ID = 'simpsonsCharacter';
    const MODEL = 'image-effects';
    const TOOL_TYPE = 'image-effects';
    
    // --- STATE ---
    let currentUploadedUrl = null;

    // --- DOM ELEMENTS ---
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const previewImage = document.getElementById('preview-image');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const resultContainer = document.getElementById('result-container');
    const resultPlaceholder = document.getElementById('result-placeholder');
    const loadingState = document.getElementById('loading-state');
    const resultImage = document.getElementById('result-image');
    const downloadBtn = document.getElementById('download-btn');

    // --- MOBILE MENU ---
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });

        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    // --- API & LOGIC FUNCTIONS ---

    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    async function submitImageGenJob(imageUrl) {
        const isVideo = MODEL === 'video-effects';
        const endpoint = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: EFFECT_ID,
                userId: USER_ID,
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: MODEL,
                toolType: TOOL_TYPE,
                effectId: EFFECT_ID,
                imageUrl: imageUrl,
                userId: USER_ID,
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    async function pollJobStatus(jobId) {
        const isVideo = MODEL === 'video-effects';
        const baseUrl = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        const MAX_POLLS = 60;
        const POLL_INTERVAL = 2000;
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) throw new Error('Failed to check status');
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') return data;
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            updateStatusText('PROCESSING... (' + (polls + 1) + ')');
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        throw new Error('Job timed out');
    }

    // --- UI HELPERS ---

    function showLoading() {
        if (loadingState) loadingState.classList.remove('hidden');
    }

    function hideLoading() {
        if (loadingState) loadingState.classList.add('hidden');
    }

    function updateStatusText(text) {
        if (generateBtn) {
            // If processing, disable button and show status
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                generateBtn.disabled = true;
                generateBtn.textContent = text;
            } else if (text === 'READY') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate';
            } else {
                generateBtn.textContent = 'Generate';
            }
        }
    }

    function showPreview(url) {
        if (previewImage) {
            previewImage.src = url;
            previewImage.classList.remove('hidden');
        }
        if (uploadPlaceholder) {
            uploadPlaceholder.classList.add('hidden');
        }
    }

    function showResultMedia(url) {
        if (!resultImage) return;

        // Clear placeholders
        resultImage.classList.add('hidden');
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');

        // Check for video (though this effect is image-based, we keep robust logic)
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        // Remove existing video if present
        const existingVideo = document.getElementById('result-video');
        if (existingVideo) existingVideo.remove();

        const container = resultImage.parentElement;

        if (isVideo) {
            const video = document.createElement('video');
            video.id = 'result-video';
            video.controls = true;
            video.autoplay = true;
            video.loop = true;
            video.className = resultImage.className;
            video.src = url;
            video.classList.remove('hidden');
            container.appendChild(video);
        } else {
            resultImage.src = url + '?t=' + new Date().getTime(); // Prevent caching
            resultImage.classList.remove('hidden');
        }
    }

    function resetUI() {
        currentUploadedUrl = null;
        fileInput.value = '';
        
        // Reset Preview
        previewImage.src = '';
        previewImage.classList.add('hidden');
        uploadPlaceholder.classList.remove('hidden');
        
        // Reset Result
        resultImage.src = '';
        resultImage.classList.add('hidden');
        const video = document.getElementById('result-video');
        if (video) video.remove();
        resultPlaceholder.classList.remove('hidden');
        
        // Reset Buttons
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generate';
        downloadBtn.disabled = true;
        downloadBtn.dataset.url = '';
        
        hideLoading();
    }

    // --- EVENT HANDLERS ---

    // 1. File Selection & Upload
    async function handleFileSelect(file) {
        if (!file) return;
        
        // Validation
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert('Please upload an image file.');
            return;
        }

        try {
            showLoading();
            updateStatusText('UPLOADING...');
            
            // Clear previous result
            resultImage.classList.add('hidden');
            resultPlaceholder.classList.remove('hidden');
            downloadBtn.disabled = true;

            // Upload
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Update UI
            showPreview(uploadedUrl);
            updateStatusText('READY');
            hideLoading();
            generateBtn.disabled = false;

        } catch (error) {
            hideLoading();
            updateStatusText('ERROR');
            console.error(error);
            alert('Upload failed: ' + error.message);
            resetUI();
        }
    }

    // File Input Change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Drag & Drop
    if (uploadZone) {
        uploadZone.addEventListener('click', () => fileInput.click());

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // 2. Generation
    if (generateBtn) {
        generateBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentUploadedUrl) return;

            try {
                showLoading();
                updateStatusText('SUBMITTING JOB...');
                
                // Submit
                const jobData = await submitImageGenJob(currentUploadedUrl);
                
                // Poll
                updateStatusText('QUEUED...');
                const result = await pollJobStatus(jobData.jobId);
                
                // Extract URL
                const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
                const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
                
                if (!resultUrl) throw new Error('No output URL in response');
                
                console.log('Result URL:', resultUrl);
                
                // Display
                showResultMedia(resultUrl);
                
                // Enable Download
                downloadBtn.dataset.url = resultUrl;
                downloadBtn.disabled = false;
                
                updateStatusText('READY');
                hideLoading();

            } catch (error) {
                hideLoading();
                updateStatusText('ERROR');
                console.error(error);
                alert('Generation failed: ' + error.message);
            }
        });
    }

    // 3. Reset
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetUI();
        });
    }

    // 4. Download
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const url = downloadBtn.dataset.url;
            if (!url) return;

            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;

            // Helper to trigger download from blob
            function downloadBlob(blob, filename) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }

            // Helper to get extension
            function getExtension(url, contentType) {
                if (contentType) {
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
                    if (contentType.includes('png')) return 'png';
                    if (contentType.includes('webp')) return 'webp';
                    if (contentType.includes('mp4')) return 'mp4';
                }
                const match = url.match(/\.(jpe?g|png|webp|mp4|webm)/i);
                return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
            }

            try {
                // Strategy 1: Proxy
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                
                if (response.ok) {
                    const blob = await response.blob();
                    const ext = getExtension(url, response.headers.get('content-type'));
                    downloadBlob(blob, 'simpsons_' + generateNanoId(8) + '.' + ext);
                } else {
                    throw new Error('Proxy failed');
                }
            } catch (err) {
                console.warn('Proxy download failed, trying direct:', err);
                try {
                    // Strategy 2: Direct Fetch
                    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                    const response = await fetch(fetchUrl, { mode: 'cors' });
                    
                    if (response.ok) {
                        const blob = await response.blob();
                        const ext = getExtension(url, response.headers.get('content-type'));
                        downloadBlob(blob, 'simpsons_' + generateNanoId(8) + '.' + ext);
                    } else {
                        throw new Error('Direct fetch failed');
                    }
                } catch (finalErr) {
                    console.error('All download methods failed:', finalErr);
                    alert('Download failed due to browser security. Please right-click the result image and select "Save Image As".');
                }
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // --- FAQ ACCORDION ---
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                item.classList.toggle('active');
                faqItems.forEach(otherItem => {
                    if (otherItem !== item) otherItem.classList.remove('active');
                });
            });
        }
    });

    // --- MODALS ---
    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('hidden');
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    }

    document.querySelectorAll('[data-modal-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-modal-target');
            openModal(targetId);
        });
    });

    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-modal-close');
            closeModal(targetId);
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });

});