#!/usr/bin/env ruby
require 'xcodeproj'
require 'fileutils'
require 'rexml/document'
require 'optparse'
options = {}
OptionParser.new do |p|
  p.on('--team TEAM') { |v| options[:team] = v }
  p.on('--environment ENV') { |v| options[:environment] = v }
end.parse!
abort 'Apple team (10 characters) and sandbox/production environment required' unless options[:team]&.match?(/\A[A-Z0-9]{10}\z/) && %w[sandbox production].include?(options[:environment])
root = File.dirname(File.expand_path(__FILE__))
app = File.join(root, 'ios/App')
project_path = File.join(app, 'App.xcodeproj')
abort 'Generate Capacitor iOS project first' unless File.directory?(project_path)
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == 'App' }
abort 'App target missing' unless target
source = File.join(app, 'App/OlamideCallKit.swift')
FileUtils.cp(File.join(root, 'callkit-native/OlamideCallKit.swift'), source)
group = project.main_group.find_subpath('App', false)
abort 'App source group missing' unless group
ref = group.files.find { |f| f.path == 'OlamideCallKit.swift' } || group.new_file('OlamideCallKit.swift')
target.source_build_phase.add_file_reference(ref) unless target.source_build_phase.files_references.include?(ref)
delegate = File.join(app, 'App/AppDelegate.swift')
s = File.read(delegate)
anchor = 'return true'
abort 'Unrecognized AppDelegate; manually initialize OlamideCalls.shared.start() at launch' unless s.include?('OlamideCalls.shared.start()') || s.include?(anchor)
File.write(delegate, s.sub(anchor, "OlamideCalls.shared.start()\n        return true")) unless s.include?('OlamideCalls.shared.start()')
plist = File.join(app, 'App/Info.plist')
info = Xcodeproj::Plist.read_from_path(plist)
info['UIBackgroundModes'] = ((info['UIBackgroundModes'] || []) + %w[audio voip remote-notification]).uniq
info['NSMicrophoneUsageDescription'] = 'Use your microphone for Olamide calls.'
Xcodeproj::Plist.write_to_path(info, plist)
storyboard = File.join(app, 'App/Base.lproj/Main.storyboard')
doc = REXML::Document.new(File.read(storyboard))
view = REXML::XPath.first(doc, '//viewController')
abort 'Main bridge controller missing' unless view
abort 'Existing custom controller requires manual merge' unless %w[CAPBridgeViewController OlamideBridgeViewController].include?(view.attributes['customClass'])
view.attributes['customClass'] = 'OlamideBridgeViewController'; view.attributes['customModule'] = 'App'
File.write(storyboard, doc.to_s)
existing = File.join(app, 'App/Olamide.entitlements')
entitlements = File.exist?(existing) ? Xcodeproj::Plist.read_from_path(existing) : {}
entitlements['aps-environment'] = options[:environment] == 'sandbox' ? 'development' : 'production'
Xcodeproj::Plist.write_to_path(entitlements, File.join(app, 'App/Olamide.entitlements'))
target.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/Olamide.entitlements'
  config.build_settings['DEVELOPMENT_TEAM'] = options[:team]
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.dobhrap.olamide'
end
project.save
puts 'CallKit/PushKit installed; signed physical-device verification is required.'
