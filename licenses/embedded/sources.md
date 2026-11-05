# Embedded runtime notices

These upstream notices cover code already embedded inside ELK and Troika, which a module-level JavaScript bundle census cannot identify separately. Archeion does not install these build-time packages.

- `elk-guava.LICENSE`: Guava 31.1-jre; embedded in the ELK worker. https://raw.githubusercontent.com/google/guava/0a17f4a429323589396c38d8ce75ca058faa6c64/COPYING
- `elk-gwt.LICENSE`: GWT 2.13.0 client/JRE emulation runtime; embedded in the ELK worker. https://raw.githubusercontent.com/gwtproject/gwt/b7117c157bbb3bcfcc022433e307722a8e12fb33/user/src/com/google/gwt/core/COPYING
- `elk-emfgwt.LICENSE`: EMF-GWT common/ecore 2.12.4; embedded in the ELK worker. https://raw.githubusercontent.com/Axellience/emfgwt/875dfb39907ad0fd5a94d2c67ae5bc91d82ca1fe/LICENSE
- `elk-xtext.LICENSE`: Xtext Xbase runtime 2.36.0; embedded in the ELK worker. https://raw.githubusercontent.com/eclipse-xtext/xtext/6c3118540d0d646b604079b1f4e9dd89fe4a9bd9/LICENSE
- `troika-woff2otf.NOTICE`: woff2otf.js embedded in troika-three-text 0.52.5. https://raw.githubusercontent.com/arty-name/woff2otf/57a5bb87191c73b2aa1217ba8a742b04d6e5b68e/woff2otf.js
- `troika-typr.LICENSE`: @lojjic/typr@0.3.8-lojjic1; embedded in troika-three-text 0.52.5. https://registry.npmjs.org/@lojjic/typr/-/typr-0.3.8-lojjic1.tgz
- `troika-fflate.LICENSE`: fflate@0.7.5; embedded in troika-three-text 0.52.5. https://registry.npmjs.org/fflate/-/fflate-0.7.5.tgz
- `troika-unicode-font-resolver.LICENSE`: @unicode-font-resolver/client@1.0.2; embedded in troika-three-text 0.52.5. https://registry.npmjs.org/@unicode-font-resolver/client/-/client-1.0.2.tgz

ELK Java sources: https://github.com/eclipse-elk/elk/tree/3aa3b9fb98d8f9a41285b3061cff5efe79ed2ba4 . The elkjs 0.12.1 release states it is based on ELK 0.12.1. Dependency versions follow its checked-in build.gradle, not a claim of a reproducible Java build.

Troika embedded versions come from the upstream v0.52.5 package.json/package-lock.json. Its woff2otf source has no release version; the notice is copied from the immutable upstream revision linked by its source provenance.

The original Maven source copyright/license comments for emitted class names are retained in elk-runtime-source-headers.NOTICE, including the full Apache Software License 1.1 notice carried by EMF's XMLTypeUtil. This product includes software developed by the Apache Software Foundation (http://www.apache.org/).

Preferred source for EMF-GWT 2.12.4: https://github.com/Axellience/emfgwt/tree/875dfb39907ad0fd5a94d2c67ae5bc91d82ca1fe . Preferred source for Xtext 2.36.0: https://github.com/eclipse-xtext/xtext/tree/6c3118540d0d646b604079b1f4e9dd89fe4a9bd9 .
