(function (cornerstone) {

    "use strict";

    if (!cornerstone.webGL) {
        cornerstone.webGL = {};
    }

    var renderCanvas = document.createElement('canvas');
    var renderCanvasContext;
    var renderCanvasData;
    var gl;
    var programs;
    var shader;
    var texCoordBuffer, positionBuffer;
    cornerstone.webGL.isWebGLInitialized = false;

    function getRenderCanvas() {
        return renderCanvas;
    }

    function initShaders() {
        for (var id in cornerstone.webGL.shaders) {
            console.log("WEBGL: Loading shader", id);
            var shader = cornerstone.webGL.shaders[ id ];
            shader.attributes = {};
            shader.uniforms = {};
            shader.vert = cornerstone.webGL.vertexShader;

            shader.program = cornerstone.webGL.createProgramFromString(gl, shader.vert, shader.frag);

            shader.attributes.texCoordLocation = gl.getAttribLocation(shader.program, "a_texCoord");
            gl.enableVertexAttribArray(shader.attributes.texCoordLocation);
        
            shader.attributes.positionLocation = gl.getAttribLocation(shader.program, "a_position");
            gl.enableVertexAttribArray(shader.attributes.positionLocation);
        
            shader.uniforms.resolutionLocation = gl.getUniformLocation(shader.program, "u_resolution");
        }
    }

    function initRenderer() {
        if (cornerstone.webGL.isWebGLInitialized === true) {
            console.log("WEBGL Renderer already initialized");
            return;
        }

        if (initWebGL(renderCanvas)) {
            initBuffers();
            initShaders();
            console.log("WEBGL Renderer initialized!");
            cornerstone.webGL.isWebGLInitialized = true;
        }
    }

    function updateRectangle(gl, width, height) {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            width, height,
            0, height,
            width, 0,
            0, 0]), gl.STATIC_DRAW);
    }

    function handleLostContext(event) {
        event.preventDefault();
        console.warn('WebGL Context Lost!');
    }

    function handleRestoredContext(event) {
        event.preventDefault();
        cornerstone.webGL.isWebGLInitialized = false;
        cornerstone.webGL.textureCache.purgeCache();
        initRenderer();
        console.log('WebGL Context Restored.');
    }

    function initWebGL(canvas) {

        gl = null;
        try {
            // Try to grab the standard context. If it fails, fallback to experimental.
            var options = {
                preserveDrawingBuffer: true, // preserve buffer so we can copy to display canvas element
            };

            // ---------------- Testing purposes ------------- 
            if (cornerstone.webGL.debug === true && WebGLDebugUtils) {
                renderCanvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(renderCanvas);
            }
            // ---------------- Testing purposes -------------

            gl = canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options);

            // Set up event listeners for context lost / context restored
            canvas.removeEventListener("webglcontextlost", handleLostContext, false);
            canvas.addEventListener("webglcontextlost", handleLostContext, false);

            canvas.removeEventListener("webglcontextrestored", handleRestoredContext, false);
            canvas.addEventListener("webglcontextrestored", handleRestoredContext, false);

        } catch(error) {
            throw "Error creating WebGL context";
        }

        // If we don't have a GL context, give up now
        if (!gl) {
            console.error("Unable to initialize WebGL. Your browser may not support it.");
            gl = null;
        }
        return gl;
    }

    function getImageDataType(image) {
        if (image.color) {
            return 'rgb';
        }

        var datatype = 'int';
        if (image.minPixelValue >= 0) {
            datatype = 'u' + datatype;
        }

        if (image.maxPixelValue > 255) {
            datatype += '16';
        } else {
            datatype += '8';
        }
        return datatype;
    }

    function getShaderProgram(image) {

        var datatype = getImageDataType(image);
        // We need a mechanism for
        // choosing the shader based on the image datatype
        // console.log("Datatype: " + datatype);
        if (cornerstone.webGL.shaders.hasOwnProperty(datatype)) {
            return cornerstone.webGL.shaders[datatype];
        }

        var shader = cornerstone.webGL.shaders.rgb;
        return shader;
    }

    function getImageTexture( image ) {
        var imageTexture = cornerstone.webGL.textureCache.getImageTexture(image.imageId);
        if (!imageTexture) {
            //console.log("Generating texture for imageid: ", image.imageId);
            imageTexture = generateTexture(image);
            cornerstone.webGL.textureCache.putImageTexture(image, imageTexture);
        }
        return imageTexture;

    }

    function generateTexturePart(i, j, maxsize, iw, ih, imageData, dataSpace, format, channels){
        // Copy the portion of data from imageData for this texture part
        // what is the position to start read?
        var readx = i * maxsize;
        var ready = j * maxsize;
        // what is the region of imageData to be read?
        var readw = Math.min(maxsize, iw-readx);
        var readh = Math.min(maxsize, ih-ready);
        
        var readOffset  = (ready * iw + readx) * channels;
        //dataSpace.fill(0.0);
        for(var yy = 0; yy < readh; yy++){
            // copy readw worth of data into dataSpace
            var readi = readOffset + yy * iw * channels;
            var writei = yy * maxsize * channels;
            for(var xx = 0; xx < readw * channels; xx++){
                dataSpace[writei + xx] = imageData[readi + xx];
            }
        }
        
        // GL texture configuration
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, format, maxsize, maxsize, 0, format, gl.UNSIGNED_BYTE, dataSpace);

        var vercoord = new Float32Array([
            readx + readw, ready + readh,
            readx, ready + readh,
            readx + readw, ready,
            readx, ready
        ]);
        // these should all be 1.0 except for the 'edge' textures.
        tx = readw / maxsize;
        ty = readh / maxsize;
        var texcoord = new Float32Array([
            tx, ty,
            0, ty,
            tx, 0.0,
            0.0, 0.0
        ]);
        return {
            texture: texture,
            vercoord: vercoord,
            texcoord: texcoord
        };
    }

    function generateTexture( image ) {
        var TEXTURE_FORMAT = {
            uint8: gl.LUMINANCE,
            int8: gl.LUMINANCE_ALPHA,
            uint16: gl.LUMINANCE_ALPHA,
            int16: gl.RGB,
            rgb: gl.RGB
        };
        var TEXTURE_BYTES = {
            int8: 1, // Luminance
            uint16: 2, // Luminance + Alpha
            int16: 3, // RGB
            rgb: 3 // RGB
        };

        var imageDataType = getImageDataType(image);
        var format = TEXTURE_FORMAT[imageDataType];
        var channels = TEXTURE_BYTES[imageDataType];
        var imageData = cornerstone.webGL.dataUtilities[imageDataType].storedPixelDataToImageData(image, image.width, image.height);

        // Get the maximum supported texture size, shifted 2 powers of 2 to be safe
        var maxsize = Math.min(Math.pow(2,Math.ceil(Math.log2(Math.max(image.width, image.height)))), gl.getParameter(gl.MAX_TEXTURE_SIZE) / 4);
        var columns = Math.ceil(image.width / maxsize);
        var rows = Math.ceil(image.height / maxsize);
        var texArray = new Array(columns * rows);

        // For better or for worse I create this array here and pass by reference
        var dataSpace = new Uint8Array(maxsize*maxsize*channels);
        var texArray = [];
        var n = 0;
        // create each texture
        for(var i = 0; i < columns; i++){
            for(var j = 0; j < rows; j++){
                texArray[n] = generateTexturePart(i, j, maxsize, image.width, image.height, imageData, dataSpace, format, channels);
                n++;
            }
        }

        // Calculate the size in bytes of this image in memory
        var sizeInBytes = maxsize * maxsize * columns * rows * channels;
        var imageTexture = {
            numparts: columns * rows,
            texArray: texArray,
            sizeInBytes: sizeInBytes
        };
        return imageTexture;
    }

    function initBuffers() {
        positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            1, 1,
            0, 1,
            1, 0,
            0, 0
        ]), gl.STATIC_DRAW);
 
        texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            1.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            0.0, 0.0,
        ]), gl.STATIC_DRAW);
    }

    function renderQuad(shader, parameters, glTransform, texture, image_width, image_height) {
        gl.clearColor(0.0,0.0,0.0,1.0);
        gl.viewport(0, 0, renderCanvas.width, renderCanvas.height);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(shader.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(shader.attributes.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(shader.attributes.positionLocation, 2, gl.FLOAT, false, 0, 0);

        for (var key in parameters) {
            var uniformLocation = gl.getUniformLocation(shader.program, key);
            if ( !uniformLocation ) {
                throw "Could not access location for uniform: " + key;
            }

            var uniform = parameters[key];

            var type = uniform.type;
            var value = uniform.value;

            if( type == "i" ) {
                gl.uniform1i( uniformLocation, value );
            } else if( type == "f" ) {
                gl.uniform1f( uniformLocation, value );
            } else if( type == "2f" ) {
                gl.uniform2f( uniformLocation, value[0], value[1] );
            }
        }

        // create the transform matrix, adding the missing bottom row
        var transf = [ glTransform[0], glTransform[1], 0.0,
                       glTransform[2], glTransform[3], 0.0,
                       glTransform[4], glTransform[5], 1.0 ];
        
        // push the transform to the shaders
        var key = "transf";
        var uniformLocation = gl.getUniformLocation(shader.program, key);
        if ( !uniformLocation ) {
            throw "Could not access location for uniform: " + key;
        }
        gl.uniformMatrix3fv( uniformLocation, false, transf );

        // render the numparts textures on their respective quads
        for(var i = 0; i < texture.numparts; i++){
            // bind the texture coordinate
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, texture.texArray[i].texcoord, gl.STATIC_DRAW);
            // bind the vertex coordinates
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, texture.texArray[i].vercoord, gl.STATIC_DRAW);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture.texArray[i].texture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }

    function render(enabledElement, glTransform) {
        // Resize the canvas according to the enabledElement canvas and not the image
        var image = enabledElement.image;
        renderCanvas.width = enabledElement.canvas.width;
        renderCanvas.height = enabledElement.canvas.height;

        var viewport = enabledElement.viewport;

        // Render the current image
        var shader = getShaderProgram(image);
        var texture = getImageTexture(image);
        var parameters = {
            "u_resolution": { type: "2f", value: [renderCanvas.width, renderCanvas.height] },
            "wc": { type: "f", value: viewport.voi.windowCenter },
            "ww": { type: "f", value: viewport.voi.windowWidth },
            "slope": { type: "f", value: image.slope },
            "intercept": { type: "f", value: image.intercept },
            //"minPixelValue": { type: "f", value: image.minPixelValue },
            "invert": { type: "i", value: viewport.invert ? 1 : 0 },
        };
        renderQuad(shader, parameters, glTransform, texture, image.width, image.height );

        return renderCanvas;
    }

    function isWebGLAvailable() {
        // Adapted from
        // http://stackoverflow.com/questions/9899807/three-js-detect-webgl-support-and-fallback-to-regular-canvas
        
        var options = {
            failIfMajorPerformanceCaveat: true
        };

        try {
            var canvas = document.createElement("canvas");
            return !!
                window.WebGLRenderingContext &&
                (canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options));
        } catch(e) {
            return false;
        }
    }

    cornerstone.webGL.renderer = {
        render: render,
        initRenderer: initRenderer,
        getRenderCanvas: getRenderCanvas,
        isWebGLAvailable: isWebGLAvailable
    };

}(cornerstone));

