/*
 * grunt-inline-alt
 * https://github.com/marcusklaas/grunt-inline-alt
 *
 * Copyright (c) 2015 Auguest G. casper & IMWEB TEAM
 */

'use strict';

module.exports = function(grunt) {

	var path = require('path');
	var datauri = require('datauri');
	var UglifyJS = require("uglify-js");
	var CleanCSS = require('clean-css');
	
	grunt.registerMultiTask('inline', "Replaces <link>, <script> and <img> tags to their inline contents", function() {

		var options = this.options({
                tag: '__inline',
                inlineTagAttributes: {
                    js: '',
                    css: ''
                }
            }),
		    relativeTo = this.options().relativeTo,
		    exts = options.exts,
			isExpandedPair;

		this.files.forEach(function(filePair) {
			isExpandedPair = filePair.orig.expand || false;

			filePair.src.forEach(function(filepath) {
				var fileType = path.extname(filepath).replace(/^\./, '');
				var fileContent = grunt.file.read(filepath);
				var destFilepath = '';

				grunt.log.write('Processing ' + filepath + ' as filetype ' + fileType + '...\n');

				if(fileType==='html' || fileType==='htm' || (exts && exts.indexOf(fileType) > -1)) {
					fileContent = html(filepath, fileContent, relativeTo, options);
				} else if(fileType==='css') {
					fileContent = css(filepath, fileContent, relativeTo, options);
				}

				if(pathIsDirectory(filePair.dest)) {
                    destFilepath = (isExpandedPair) ? filePair.dest : unixifyPath(path.join(filePair.dest, path.basename(filepath)));
				} else {
					destFilepath = filePair.dest || filepath;
				}
				
				grunt.file.write(destFilepath, fileContent);
				grunt.log.ok();
			});
		});
	});

	function isRemotePath(url) {
//grunt.log.write('isRemotePath called -' + url + '\n matches = ' + (url.match(/^'?https?:\/\//) || url.match(/^\/\//)) + '***\n');
		return url.match(/^'?https?:\/\//) || url.match(/^\/\//);
	}

	function isBase64Path(url) {
//grunt.log.write('isBase64Path called -' + url + '\n matches = ' + (url.match(/^'?data.*base64/)) + '^^^\n');
		return url.match(/^'?data.*base64/);
	}

	// code from grunt-contrib-copy, with a little modification
	function pathIsDirectory(dest) {
		return grunt.util._.endsWith(dest, '/');
	}

	function unixifyPath(filepath) {
		if (process.platform === 'win32') {
			return filepath.replace(/\\/g, '/');
		} else {
			return filepath;
		}
	}

    function getDataAttribs(attrs) {
        var reg = /(data-[\a-z-]+="[\w-]+")/gm;
        return attrs.match(reg) || [];
    }

	function html(filepath, fileContent, relativeTo, options) {
	    if(relativeTo) {
	        filepath = filepath.replace(/[^\/]+\//, relativeTo);
	    }

        var cssReplacement = function(matchedWord, src) {
//grunt.log.write('cssReplacement :: matchedWord=' + matchedWord + ',imgUrl=' + src + '\n%%%\n');
            if(isRemotePath(src) || (isBase64Path(src)) || src.indexOf(options.tag) == -1) {
				return matchedWord;
			}
			var inlineFilePath = path.resolve(path.dirname(filepath), src).replace(/\?.*$/, '');
			if (grunt.file.exists(inlineFilePath)) {
				var styleSheetContent = grunt.file.read(inlineFilePath);
				var ret = '<style ' + options.inlineTagAttributes.css + '>\n' + cssInlineToHtml(filepath, inlineFilePath, styleSheetContent, relativeTo, options) + '\n</style>';
				return ret;
			} else {
				grunt.log.error("Couldn't find " + inlineFilePath + '!\n');

				return matchedWord;
			}
        }

        var imageReplacement = function(matchedWord, src) {
            if( ! grunt.file.isPathAbsolute(src) && src.indexOf(options.tag)!=-1) {
                var inlineFilePath = path.resolve(path.dirname(filepath), src).replace(/\?.*$/, '');	// 将参数去掉

                if(grunt.file.exists(inlineFilePath)) {
                    return matchedWord.replace(src, (new datauri(inlineFilePath)).content);
                } else {
                    grunt.log.error("Couldn't find " + inlineFilePath + '!');
                }
            }

            return matchedWord;
        }

        var scriptReplacement = function (matchedWord, src, attrs) {
            if( ! isRemotePath(src) && src.indexOf(options.tag)!=-1) {
                var dataAttribs = getDataAttribs(attrs);
                var inlineFilePath = path.resolve(path.dirname(filepath), src).replace(/\?.*$/, '');
                var c = options.uglify ? UglifyJS.minify(inlineFilePath).code : grunt.file.read(inlineFilePath);

                if(grunt.file.exists(inlineFilePath)) {
                    var inlineTagAttributes = options.inlineTagAttributes.js;
                    return '<script ' + inlineTagAttributes + ' ' + dataAttribs.join(' ') +' >\n' + (options.wrap_content_cdata ? '<![CDATA[\n' : '') + c + '\n' + (options.wrap_content_cdata ? '\n]]>' : '') + '\n</script>';
                } else {
                    grunt.log.error("Couldn't find " + inlineFilePath + '!\n');
                }
            }

            return matchedWord;
        }

        var htmlInclusion = function (matchedWord, src) {
			if( ! isRemotePath(src) && grunt.file.isPathAbsolute(src)) {
				return matchedWord;
			}

			var inlineFilePath = path.resolve(path.dirname(filepath), src);

			if( ! grunt.file.exists(inlineFilePath)) {
				grunt.log.error("Couldn't find " + inlineFilePath + '!\n');

				return matchedWord;
			}

			var ret = grunt.file.read(inlineFilePath);
			// @todo need to be checked, add bye herbert
			var _more = src.match(/^(..\/)+/ig);

			if( ! _more || !_more[0]) {
				return ret;
			}

			var _addMore = function(_ret, _, _src) {
				if( ! _src.match(/^http\:\/\//)) {
					return arguments[1] +  _more + arguments[2] + arguments[3];
				}

				return _ret;
			};

			return ret.replace(/(<script.+?src=["'])([^"']+?)(["'].*?><\/script>)/g, _addMore);
        }

		var ret= fileContent.replace(/<inline.+?src=["']([^"']+?)["']\s*?\/>/gi, htmlInclusion)
	            .replace(/<script.+?src=["']\/?([^"']+?)["'](.*?)>\s*<\/script>/gi, scriptReplacement)
		    .replace(/<link.+?href=["']\/?([^"']+?)["'].*?rel=["'][^"']*?icon[^"']*?["'].*?\/?>/gi, imageReplacement)
		    .replace(/<link.+?rel=["'][^"']*?icon[^"']*?["'].*?href=["']\/?([^"']+?)["'].*?\/?>/gi, imageReplacement)
                    .replace(/<link.+?href=["']\/?([^"']+?)["'].*?\/?>/gi, cssReplacement)
                    .replace(/<img.+?src=["']\/?([^"':]+?)["'].*?\/?\s*?>/gi, imageReplacement);

		return ret;
	}

	function css(filepath, fileContent, relativeTo, options) {
	    return cssInlineToHtml(filepath, filepath, fileContent, relativeTo, options);
	}

	function cssInlineToHtml(htmlFilepath, filepath, fileContent, relativeTo, options) {
	    if(relativeTo) {
	        filepath = filepath.replace(/[^\/]+\//g, relativeTo);
	    }
		// match tokens with "url" in content
		var urlMatcher = function(matchedWord, imgUrl) {
            if (!imgUrl || !matchedWord) {
                        return;
            }
            var flag = imgUrl.indexOf(options.tag) != -1;	// urls like "img/bg.png?__inline" will be transformed to base64
//grunt.log.write('urlMatcher :: matchedWord=' + matchedWord + ',imgUrl=' + imgUrl + '\n$$$\n');
			if((isBase64Path(imgUrl)) || isRemotePath(imgUrl)) {
				return matchedWord;
			}

			var absoluteImgUrl = path.resolve(path.dirname(filepath), imgUrl);	// img url relative to project root
			var newUrl = path.relative(path.dirname(htmlFilepath), absoluteImgUrl);	// img url relative to the html file

			absoluteImgUrl = absoluteImgUrl.replace(/\?.*$/, '');

			if(flag && grunt.file.exists(absoluteImgUrl)) {
				newUrl = new datauri(absoluteImgUrl);
			} else {
				newUrl = newUrl.replace(/\\/g, '/');
			}

			return matchedWord.replace(imgUrl, newUrl);
		};
		fileContent = fileContent.replace(/url\(["']*([^)'"]+)["']*\)/g, urlMatcher);
		if (options.cssmin) {
			try {
			var compiled = new CleanCSS({
				rebase: false,
				report: 'min',
				sourceMap: false
			      }).minify(fileContent);

			if (compiled.warnings.length) {
			  grunt.log.error(compiled.warnings.toString());
			}

			if (compiled.errors.length) {
			  grunt.warn(compiled.errors.toString());
			} else {
				fileContent = compiled.styles;
			}

			if (options.debug) {
			  grunt.log.writeln(util.format(compiled.stats));
			}
			} catch (err) {
			grunt.log.error(err);
			grunt.warn('Inline sub-task CSS minification failed at ' + htmlFilepath + '.');
			}
		}
		if (options.wrap_content_cdata) {
			fileContent = '<![CDATA[\n' + fileContent + ']]>';
		}
		return  fileContent;
	}
};
